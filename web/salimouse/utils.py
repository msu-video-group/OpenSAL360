from ua_parser import user_agent_parser
import uuid
from itertools import chain
import numpy as np
import salimouse.models
from django.db.models import Q, Count
from django.utils import timezone
from datetime import timedelta


def get_or_none(model, *args, **kwargs):
    queryset = model.objects.filter(*args, **kwargs)[:1]
    return queryset[0] if len(queryset) else None


def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        client_ip = x_forwarded_for.split(',')[-1].strip()
    else:
        client_ip = request.META.get('REMOTE_ADDR')
    return client_ip


def get_client_ua(request):
    return request.META.get('HTTP_USER_AGENT')


def get_parsed_client_ua(request):
    return user_agent_parser.Parse(request.META.get('HTTP_USER_AGENT'))


UA_FAMILY_BLACKLIST = ('IE')


def is_supported_ua(ua_parsed):
    try:
        family = ua_parsed['user_agent']['family']
        return family not in UA_FAMILY_BLACKLIST
    except KeyError:
        return True

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
    res = '#{:03d} E:{:03d} {}'.format(
        self.id, self.experiment.id, self.login_ip)

    try:
        ua = self.login_user_agent_parsed['user_agent']
        res += ' ' + ua['family'] + ua['major']
    except KeyError:
        pass

    res += ' ' + str(self.uuid)

    try:
        pixel_ratio = int(self.login_client_info['device_pixel_ratio'])
        w = int(self.login_client_info['screen_width'])
        h = int(self.login_client_info['screen_height'])
        res += ' {}x{}'.format(pixel_ratio * w, pixel_ratio * h)
    except KeyError:
        pass

    return res


def get_or_create_participant_uuid(request):
    participation_uuid = request.session.get('participation_uuid')
    if participation_uuid is None:
        participation_uuid = uuid.uuid4()
        request.session['participation_uuid'] = str(participation_uuid)
    return participation_uuid

def get_active_participation(participation_uuid, experiment_id):
    two_hours_ago = timezone.now() - timedelta(hours=2)
    # Extract only unpaid participations (paid have activation='blah blah blah')
    # Exclude those participations whose last seen videos where >2 hours ago
    participation = salimouse.models.Participation.objects.filter(
        Q(videoview__seen=False) |
        Q(videoview__server_timestamp__gte=two_hours_ago),
        uuid=participation_uuid,
        experiment=experiment_id,
        activation_code=''
    ).first()

    return participation
