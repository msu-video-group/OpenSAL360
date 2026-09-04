import uuid
from itertools import chain
import numpy as np
import salimouse.models
from django.conf import settings
from django.db.models import Count, F, Max
from django.db.models.functions import Coalesce
from django.utils import timezone
from datetime import timedelta


PARTICIPANT_COOKIE_NAME = 'salimouse_participant'
PARTICIPANT_COOKIE_SALT = 'salimouse.participant'


def get_or_none(model, *args, **kwargs):
    queryset = model.objects.filter(*args, **kwargs)[:1]
    return queryset[0] if len(queryset) else None



def get_weights(video_batches, video_id_to_count, num_views_by_video, num_videos_by_obs, cut_overselect=False, verbose=False):
    counts = np.array([
        video_id_to_count.get(vb[0].id, 0) for vb in video_batches
    ])
    if verbose:
        lack_views_by_video = np.clip(num_views_by_video - counts, 0, num_views_by_video)
        part_left = max(
            max(lack_views_by_video),
            int(np.ceil(lack_views_by_video.sum() / num_videos_by_obs))
        )
        print(f'Participants left: {part_left}')
    unfilled_video_views_mask = counts < num_views_by_video
    if unfilled_video_views_mask.sum() < num_videos_by_obs:
        weights = np.array([
            1 / (c + 1) for c in counts
        ])
        weights[unfilled_video_views_mask] = 100
    else:
        weights = np.array([
            1 / (c + 1) if
                not cut_overselect or
                c < num_views_by_video
            else 0 for c in counts
        ])
    weights /= weights.sum()
    return weights


def generate_videos_set(experiment):
    experiment_videos = experiment.videos.all()

    straight_videos = {v.name: v for v in experiment_videos if not v.is_reversed}
    reversed_videos = {v.name: v for v in experiment_videos if v.is_reversed}
    intersection = set([name for name in straight_videos]).intersection([name[:-9] for name in reversed_videos])
    video_batches = [(straight_videos[name], reversed_videos[f'{name}_reversed']) for name in intersection]
    video_batches += [(straight_videos[name], ) for name in straight_videos.keys() if name not in intersection]
    video_batches += [(reversed_videos[name], ) for name in reversed_videos.keys() if name[:-9] not in intersection]

    ordinary_video_batches = [vb for vb in video_batches if not vb[0].is_validation]
    validation_video_batches = [vb for vb in video_batches if vb[0].is_validation]

    num_validation_videos = min(
        len(validation_video_batches), experiment.num_validation_videos)
    num_ordinary_videos = min(
        len(ordinary_video_batches), experiment.num_participation_videos)

    eligible_participations = (
        salimouse.models.Participation.objects
        .filter(completed=True, admin_mode=False, experiment_id=experiment.id)
        .annotate(vv_count=Count('videoview'))
        .filter(vv_count=num_validation_videos + num_ordinary_videos)
        .values_list('id', flat=True)
    )
    video_view_counts = (
        salimouse.models.VideoView.objects
        .filter(participation_id__in=eligible_participations)
        .values('video_id')
        .annotate(video_count=Count('id'))
    )
    video_id_to_count = {v['video_id']: v['video_count'] for v in video_view_counts}

    selected_video_batches = []
    if num_validation_videos > 0:
        validation_weights = get_weights(validation_video_batches, video_id_to_count, experiment.num_views_by_video, num_validation_videos)
        selected_validation_video_batches_idxs = np.random.choice(
            len(validation_video_batches), num_validation_videos, replace=False, p=validation_weights) if len(validation_video_batches) > 0 else None
        selected_video_batches += list(np.array(validation_video_batches)[selected_validation_video_batches_idxs])
    if num_ordinary_videos > 0:
        ordinary_weights = get_weights(ordinary_video_batches, video_id_to_count, experiment.num_views_by_video, num_ordinary_videos, cut_overselect=True, verbose=True)
        selected_ordinary_video_batches_idxs = np.random.choice(
            len(ordinary_video_batches), num_ordinary_videos, replace=False, p=ordinary_weights) if len(ordinary_video_batches) > 0 else None
        selected_video_batches += list(np.array(ordinary_video_batches)[selected_ordinary_video_batches_idxs])
    else:
        print(
            '------------------------------------\n'
            'ERROR: No test videos were selected!\n'
            '------------------------------------'
        )

    np.random.shuffle(selected_video_batches)
    res_video_set = list(chain(*selected_video_batches))
    print(f'Generate videos set with {len(res_video_set)} videos')

    return res_video_set


def get_participation_title(self):
    res = '#{:03d} E:{:03d}'.format(
        self.id, self.experiment.id)

    res += ' ' + str(self.uuid)

    try:
        pixel_ratio = int(self.login_client_info['device_pixel_ratio'])
        w = int(self.login_client_info['screen_width'])
        h = int(self.login_client_info['screen_height'])
        res += ' {}x{}'.format(pixel_ratio * w, pixel_ratio * h)
    except KeyError:
        pass

    return res


def get_participant_uuid(request):
    participation_uuid = request.session.get('participation_uuid')
    if participation_uuid is None:
        participation_uuid = request.get_signed_cookie(
            PARTICIPANT_COOKIE_NAME,
            default=None,
            salt=PARTICIPANT_COOKIE_SALT,
            max_age=settings.SESSION_COOKIE_AGE,
        )

    if participation_uuid is None:
        return None

    try:
        participation_uuid = uuid.UUID(str(participation_uuid))
    except (TypeError, ValueError, AttributeError):
        return None

    request.session['participation_uuid'] = str(participation_uuid)
    return participation_uuid


def get_or_create_participant_uuid(request):
    participation_uuid = get_participant_uuid(request)
    if participation_uuid is None:
        participation_uuid = uuid.uuid4()
        request.session['participation_uuid'] = str(participation_uuid)
    return participation_uuid


def set_participant_cookie(response, participation_uuid):
    response.set_signed_cookie(
        PARTICIPANT_COOKIE_NAME,
        str(participation_uuid),
        salt=PARTICIPANT_COOKIE_SALT,
        max_age=settings.SESSION_COOKIE_AGE,
        secure=settings.SESSION_COOKIE_SECURE,
        httponly=True,
        samesite=settings.SESSION_COOKIE_SAMESITE,
    )

def get_active_participation(participation_uuid, experiment_id):
    two_hours_ago = timezone.now() - timedelta(hours=2)
    # A participation can be resumed for two hours after its latest submitted
    # video. Before the first video, use the participation creation/update time.
    # Unseen videos must not keep an abandoned participation active forever.
    return (
        salimouse.models.Participation.objects
        .filter(
            uuid=participation_uuid,
            experiment_id=experiment_id,
            activation_code='',
        )
        .annotate(
            last_activity=Coalesce(
                Max('videoview__server_timestamp'),
                F('login_server_timestamp'),
            ),
        )
        .filter(last_activity__gte=two_hours_ago)
        .order_by('-last_activity', '-id')
        .first()
    )
