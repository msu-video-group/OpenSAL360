import json
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase
from django.urls import reverse
from django.utils import timezone
from django.utils.datastructures import MultiValueDict

from .forms import VideoAdminUploadForm
from .models import Experiment, Participation, Video, VideoView
from .utils import PARTICIPANT_COOKIE_NAME


class VideoModelTests(TestCase):
    def test_video_metadata_cannot_change_after_creation(self):
        video = Video.objects.create(path='scene.mp4', fps=30, duration=12.5)

        video.fps = 60

        with self.assertRaisesMessage(ValidationError, 'fps cannot be modified'):
            video.save()

    def test_client_fps_uses_recorded_render_timestamps(self):
        video_view = VideoView(
            data_fps={
                'render_video_timestamps': [0.0, 0.02, 0.04, 0.06],
                'video_duration': 2,
            }
        )

        self.assertEqual(video_view.client_fps, 2)


class VideoAdminUploadFormTests(TestCase):
    def build_form(self, *filenames):
        files = MultiValueDict({
            'videos': [
                SimpleUploadedFile(filename, b'video data', content_type='video/mp4')
                for filename in filenames
            ],
        })
        return VideoAdminUploadForm(data={}, files=files)

    def test_accepts_one_video(self):
        form = self.build_form('validation.mp4')

        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(
            [uploaded.name for uploaded in form.cleaned_data['videos']],
            ['validation.mp4'],
        )

    def test_accepts_multiple_videos(self):
        form = self.build_form('first.mp4', 'second.mp4')

        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(
            [uploaded.name for uploaded in form.cleaned_data['videos']],
            ['first.mp4', 'second.mp4'],
        )

    def test_requires_at_least_one_video(self):
        form = self.build_form()

        self.assertFalse(form.is_valid())
        self.assertEqual(form.errors.as_data()['videos'][0].code, 'required')


class VideoAdminUploadViewTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            username='video-admin',
            email='video-admin@example.com',
            password='password',
        )
        self.client.force_login(self.user)

    @patch('salimouse.admin.import_uploaded_video')
    def test_single_video_can_be_marked_as_validation(self, import_video):
        import_video.return_value = Video.objects.create(
            path='validation.mp4',
            is_validation=True,
            fps=30,
            duration=10,
        )

        response = self.client.post(
            reverse('admin:salimouse_video_upload'),
            data={
                'videos': SimpleUploadedFile(
                    'validation.mp4',
                    b'video data',
                    content_type='video/mp4',
                ),
                'validation_files': '0',
            },
        )

        self.assertRedirects(
            response,
            reverse('admin:salimouse_video_changelist'),
            fetch_redirect_response=False,
        )
        import_video.assert_called_once()
        self.assertEqual(import_video.call_args.args[0].name, 'validation.mp4')
        self.assertTrue(import_video.call_args.kwargs['is_validation'])


class ParticipationApiTests(TestCase):
    def setUp(self):
        self.experiment = Experiment.objects.create(
            name='Attention study',
            num_participation_videos=2,
            num_validation_videos=0,
            fast_mode=False,
        )
        self.videos = [
            Video.objects.create(path='city.mp4', fps=30, duration=8),
            Video.objects.create(path='forest.mp4', fps=30, duration=9),
        ]
        self.experiment.videos.set(self.videos)

    def create_participation(self):
        return self.client.post(
            reverse('get-participation', args=[self.experiment.id]),
            data=json.dumps({
                'timestamp': '2026-06-01T10:00:00Z',
                'client_info': {
                    'screen_width': 1920,
                    'screen_height': 1080,
                    'device_pixel_ratio': 1,
                },
            }),
            content_type='application/json',
        )

    def submit_video(self, participation, video, score=4):
        return self.client.post(
            reverse('video-view-result'),
            data=json.dumps({
                'participation': participation.id,
                'video': video.id,
                'client_timestamp_start': '2026-06-01T10:00:00Z',
                'client_timestamp_finish': '2026-06-01T10:00:08Z',
                'data_gazes': {'t': [0, 100], 'x': [0, 0.1], 'y': [0, -0.1], 'z': [0, 0]},
                'data_fps': {'render_video_timestamps': [0, 0.016]},
                'video_score': score,
            }),
            content_type='application/json',
        )

    def test_creation_assigns_videos_and_reuses_the_active_session(self):
        first_response = self.create_participation()

        self.assertEqual(first_response.status_code, 201)
        first_payload = first_response.json()
        self.assertTrue(first_payload['new_participation'])
        self.assertSetEqual(
            {video['id'] for video in first_payload['videos']},
            {video.id for video in self.videos},
        )
        self.assertEqual(
            VideoView.objects.filter(participation_id=first_payload['participation_id']).count(),
            2,
        )

        second_response = self.create_participation()

        self.assertEqual(second_response.status_code, 201)
        self.assertEqual(
            second_response.json()['participation_id'],
            first_payload['participation_id'],
        )
        self.assertEqual(Participation.objects.count(), 1)
        self.assertEqual(VideoView.objects.count(), 2)

    def test_results_persist_data_and_complete_after_the_last_video(self):
        participation_id = self.create_participation().json()['participation_id']
        participation = Participation.objects.get(id=participation_id)

        first_response = self.submit_video(participation, self.videos[0], score=3)

        self.assertEqual(first_response.status_code, 201)
        self.assertNotIn('verification_code', first_response.json())
        first_view = VideoView.objects.get(participation=participation, video=self.videos[0])
        self.assertTrue(first_view.seen)
        self.assertEqual(first_view.video_score, 3)
        self.assertEqual(first_view.data_gazes['x'], [0, 0.1])
        participation.refresh_from_db()
        self.assertFalse(participation.completed)

        final_response = self.submit_video(participation, self.videos[1])

        self.assertEqual(final_response.status_code, 201)
        participation.refresh_from_db()
        self.assertTrue(participation.completed)
        self.assertEqual(
            final_response.json()['verification_code'],
            str(participation.verification_code),
        )

    def test_duplicate_video_result_acknowledges_a_lost_success_response(self):
        participation_id = self.create_participation().json()['participation_id']
        participation = Participation.objects.get(id=participation_id)
        first_response = self.submit_video(participation, self.videos[0], score=3)

        retry_response = self.submit_video(participation, self.videos[0], score=5)

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(retry_response.status_code, 201)
        self.assertEqual(retry_response.json()['status'], 'ok')
        self.assertEqual(
            VideoView.objects.get(
                participation=participation,
                video=self.videos[0],
            ).video_score,
            3,
        )

    def test_duplicate_final_result_returns_the_completion_code(self):
        participation_id = self.create_participation().json()['participation_id']
        participation = Participation.objects.get(id=participation_id)
        self.submit_video(participation, self.videos[0])
        first_response = self.submit_video(participation, self.videos[1])

        retry_response = self.submit_video(participation, self.videos[1])

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(retry_response.status_code, 201)
        self.assertEqual(
            retry_response.json()['verification_code'],
            str(participation.verification_code),
        )

    def test_results_cannot_be_submitted_from_another_session(self):
        participation_id = self.create_participation().json()['participation_id']
        participation = Participation.objects.get(id=participation_id)
        other_browser = Client()

        response = other_browser.post(
            reverse('video-view-result'),
            data=json.dumps({
                'participation': participation.id,
                'video': self.videos[0].id,
                'client_timestamp_start': '2026-06-01T10:00:00Z',
                'client_timestamp_finish': '2026-06-01T10:00:08Z',
                'data_gazes': {},
                'data_fps': {},
                'video_score': 0,
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 401)
        self.assertFalse(VideoView.objects.get(
            participation=participation,
            video=self.videos[0],
        ).seen)

    def test_result_submission_survives_admin_logout_in_same_browser(self):
        participation_id = self.create_participation().json()['participation_id']
        participation = Participation.objects.get(id=participation_id)
        user = get_user_model().objects.create_superuser(
            username='participant-admin',
            email='participant-admin@example.com',
            password='password',
        )
        self.client.force_login(user)
        self.client.post(reverse('admin:logout'))

        response = self.submit_video(participation, self.videos[0])

        self.assertEqual(response.status_code, 201)
        self.assertTrue(VideoView.objects.get(
            participation=participation,
            video=self.videos[0],
        ).seen)

    def test_unwatched_participation_expires_after_two_hours(self):
        first_id = self.create_participation().json()['participation_id']
        Participation.objects.filter(id=first_id).update(
            login_server_timestamp=timezone.now() - timedelta(hours=3),
        )

        response = self.create_participation()

        self.assertEqual(response.status_code, 201)
        self.assertNotEqual(response.json()['participation_id'], first_id)
        self.assertEqual(Participation.objects.count(), 2)

    def test_partially_watched_participation_expires_from_last_video(self):
        first_id = self.create_participation().json()['participation_id']
        participation = Participation.objects.get(id=first_id)
        self.assertEqual(
            self.submit_video(participation, self.videos[0]).status_code,
            201,
        )
        stale_time = timezone.now() - timedelta(hours=3)
        Participation.objects.filter(id=first_id).update(
            login_server_timestamp=stale_time,
        )
        VideoView.objects.filter(participation_id=first_id, seen=True).update(
            server_timestamp=stale_time,
        )

        response = self.create_participation()

        self.assertEqual(response.status_code, 201)
        self.assertNotEqual(response.json()['participation_id'], first_id)
        self.assertEqual(Participation.objects.count(), 2)

    def test_recent_partial_participation_resumes_with_unseen_video(self):
        first_payload = self.create_participation().json()
        participation = Participation.objects.get(
            id=first_payload['participation_id'],
        )
        self.assertEqual(
            self.submit_video(participation, self.videos[0]).status_code,
            201,
        )

        response = self.create_participation()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['participation_id'], participation.id)
        self.assertEqual(
            [video['id'] for video in response.json()['videos']],
            [self.videos[1].id],
        )

    def test_recent_completed_participation_returns_terminal_state(self):
        participation_id = self.create_participation().json()['participation_id']
        participation = Participation.objects.get(id=participation_id)
        for video in self.videos:
            self.assertEqual(self.submit_video(participation, video).status_code, 201)

        response = self.create_participation()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['participation_id'], participation_id)
        self.assertEqual(response.json()['videos'], [])
        self.assertFalse(response.json()['new_participation'])

    def test_completed_participation_expires_after_two_hours(self):
        first_id = self.create_participation().json()['participation_id']
        participation = Participation.objects.get(id=first_id)
        for video in self.videos:
            self.assertEqual(self.submit_video(participation, video).status_code, 201)
        stale_time = timezone.now() - timedelta(hours=3)
        Participation.objects.filter(id=first_id).update(
            login_server_timestamp=stale_time,
        )
        VideoView.objects.filter(participation_id=first_id).update(
            server_timestamp=stale_time,
        )

        response = self.create_participation()

        self.assertEqual(response.status_code, 201)
        self.assertNotEqual(response.json()['participation_id'], first_id)
        self.assertEqual(len(response.json()['videos']), 2)

    def test_new_run_copies_the_most_recent_questionnaire(self):
        first_id = self.create_participation().json()['participation_id']
        first = Participation.objects.get(id=first_id)
        first.questions_info = {'answer': 'older'}
        first.save()
        Participation.objects.filter(id=first_id).update(
            login_server_timestamp=timezone.now() - timedelta(hours=4),
        )

        second_id = self.create_participation().json()['participation_id']
        second = Participation.objects.get(id=second_id)
        second.questions_info = {'answer': 'newer'}
        second.save()
        Participation.objects.filter(id=second_id).update(
            login_server_timestamp=timezone.now() - timedelta(hours=3),
        )

        third_response = self.create_participation()
        third_id = third_response.json()['participation_id']

        self.assertEqual(
            Participation.objects.get(id=third_id).questions_info,
            {'answer': 'newer'},
        )
        self.assertFalse(third_response.json()['new_participation'])

    def test_paid_participation_is_not_resumed(self):
        first_id = self.create_participation().json()['participation_id']
        Participation.objects.filter(id=first_id).update(
            activation_code='already-paid',
        )

        response = self.create_participation()

        self.assertEqual(response.status_code, 201)
        self.assertNotEqual(response.json()['participation_id'], first_id)


class ExperimentPageTests(TestCase):
    def test_player_modules_are_loaded_in_dependency_order(self):
        experiment = Experiment.objects.create(name='Module smoke test')

        response = self.client.get(reverse('experiment', args=[experiment.id]))

        self.assertEqual(response.status_code, 200)
        html = response.content.decode()
        module_names = [
            'core.js',
            'state.js',
            'participation.js',
            'player.js',
            'sensitivity.js',
            'tracking.js',
            'validation.js',
            'tutorial.js',
            'media.js',
            'screen-check.js',
        ]
        positions = [html.index('/static/js/salimouse/' + name) for name in module_names]

        self.assertEqual(positions, sorted(positions))
        self.assertNotContains(response, 'salimouse-player.js')
        self.assertContains(response, 'id="instructions-panel"')
        self.assertNotContains(response, 'unsupported-browser')
        self.assertNotContains(response, 'The browser you are using is not suitable')

    def test_usage_guide_stays_hidden_for_completed_participant(self):
        experiment = Experiment.objects.create(name='Completed study')
        video = Video.objects.create(path='completed.mp4', fps=30, duration=10)
        experiment.videos.add(video)
        participation = Participation.objects.create(
            experiment=experiment,
            uuid='e3f01d70-cc08-4409-b321-3edc0498f709',
            login_client_info={},
            completed=True,
        )
        VideoView.objects.create(
            participation=participation,
            video=video,
            seen=True,
            server_timestamp=timezone.now(),
        )
        session = self.client.session
        session['participation_uuid'] = str(participation.uuid)
        session.save()

        response = self.client.get(reverse('experiment', args=[experiment.id]))

        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, 'id="instructions-panel"')
        self.assertContains(
            response,
            'id="helpBlock" class="centerer" '
            'style="background-color: #000000a0; display: none;"',
        )

    def test_fast_mode_uses_the_full_usage_guide(self):
        experiment = Experiment.objects.create(
            name='Fast study with full guide',
            fast_mode=True,
        )

        response = self.client.get(reverse('experiment', args=[experiment.id]))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Measurement examples:')
        self.assertContains(response, 'id="rules"')
        self.assertContains(response, 'id="cards"')
        self.assertContains(response, 'id="mac_instruction"')
        self.assertContains(response, 'id="helpBlock"', count=1)

    def test_admin_logout_does_not_reset_participant_identity(self):
        experiment = Experiment.objects.create(name='Persistent participant')
        first_response = self.client.get(reverse('experiment', args=[experiment.id]))
        first_uuid = self.client.session['participation_uuid']

        self.assertIn(PARTICIPANT_COOKIE_NAME, first_response.cookies)

        user = get_user_model().objects.create_superuser(
            username='shared-browser-admin',
            email='shared-browser-admin@example.com',
            password='password',
        )
        self.client.force_login(user)
        self.client.post(reverse('admin:logout'))

        self.client.get(reverse('experiment', args=[experiment.id]))

        self.assertEqual(self.client.session['participation_uuid'], first_uuid)


class DataExportAccessTests(TestCase):
    def setUp(self):
        self.urls = [
            reverse('experiment-view-data', args=[999999]),
            reverse('experiment-val-view-data', args=[999999]),
            reverse('participation-data', args=[999999]),
        ]

    def test_exports_require_staff_access(self):
        for url in self.urls:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 302)
                self.assertIn(reverse('admin:login'), response.url)

    def test_staff_receives_json_error_for_unknown_activation_code(self):
        user = get_user_model().objects.create_user(
            username='export-admin',
            password='password',
            is_staff=True,
        )
        self.client.force_login(user)

        response = self.client.get(reverse('participation-data', args=[999999]))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(),
            {'error': 'There is no participation with such activation code'},
        )
