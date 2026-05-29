from django.shortcuts import render
from django.shortcuts import redirect
from django.http import JsonResponse, HttpResponse
from django.db import transaction
from django.db.models import Q

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from datetime import timedelta

from salimouse.models import Video, Participation, Experiment, VideoView
from salimouse.serializers import VideoSerializer, ParticipationCreateRequestSerializer, VideoViewClientDataSerializer, ParticipationReactInfoSerializer, ParticipationQuestionsInfoSerializer, ParticipationAllInfoSerializer, ParticipationAdminModeSerializer, ParticipationRotateSpeedSerializer

from . import utils
from .utils import get_or_none, get_client_ip, get_client_ua, generate_videos_set, get_parsed_client_ua, get_active_participation
import uuid



def experiment(request, experiment_id):
    experiment = get_or_none(Experiment, id=experiment_id)
    if not experiment:
        return HttpResponse('Experiment not found', status=status.HTTP_404_NOT_FOUND)

    ua_parsed = utils.get_parsed_client_ua(request)
    is_supported_ua = utils.is_supported_ua(ua_parsed)
    relative_background_blur_radius = experiment.relative_background_blur_radius
    relative_gaze_size_percent = experiment.relative_gaze_size_percent
    with_audio = experiment.with_audio
    stars = experiment.stars
    random_start = experiment.random_start
    field_of_view = experiment.field_of_view
    mode = experiment.mode
    fast_mode = experiment.fast_mode
    unseen_cursor = experiment.unseen_cursor
    context = {
        'experiment_id': experiment_id,
        'is_supported_ua': is_supported_ua,
        'num_seen_videos': 0,
        'verification_code': '',
        'relative_background_blur_radius': float(relative_background_blur_radius),
        'relative_gaze_size_percent': float(relative_gaze_size_percent),
        'with_audio': int(with_audio),
        'stars': int(stars),
        'random_start': int(random_start),
        'field_of_view': float(field_of_view),
        'mode': mode,
        'fast_mode': int(fast_mode),
        'unseen_cursor': int(unseen_cursor)
    }

    participation_uuid = utils.get_or_create_participant_uuid(request)
    participation = get_active_participation(participation_uuid, experiment_id)

    if participation:
        context['num_seen_videos'] = VideoView.objects.filter(participation_id=participation.id, seen=True).count()
        if participation.is_completed():
            context['verification_code'] = str(participation.verification_code)

    return HttpResponse(render(request, 'index.html', context=context))


def index(request):
    random_experiment = Experiment.objects.filter(is_active=True).order_by('?').first()
    if random_experiment:
        return redirect('experiment', experiment_id=random_experiment.id)
    else:
        return HttpResponse('There are no active experiments', status=status.HTTP_404_NOT_FOUND)


@csrf_exempt
@api_view(['GET', 'POST'])
def participation_create_request(request, experiment_id=None, format=None):
    client_data = ParticipationCreateRequestSerializer(data=request.data)

    if not client_data.is_valid():
        return Response(client_data.errors,
                        status=status.HTTP_400_BAD_REQUEST)
    client_data = client_data.validated_data

    experiment = get_or_none(Experiment, id=experiment_id)
    if not experiment:
        return Response('Experiment not found', status=status.HTTP_400_BAD_REQUEST)

    # Find a participation
    participation_uuid = utils.get_or_create_participant_uuid(request)
    participation = get_active_participation(participation_uuid, experiment_id)

    if participation is None:
        # Create a new participation
        participation = Participation()
        participation.experiment = experiment
        participation.uuid = participation_uuid
        participation.login_user_agent = get_client_ua(request)
        participation.login_ip = get_client_ip(request)

        participation.login_client_timestamp = client_data['timestamp']
        participation.login_client_info = client_data['client_info']

        # Sample videos
        videos = generate_videos_set(experiment)

        two_days_ago = timezone.now() - timedelta(days=2)
        previous_questions = Participation.objects.filter(
            uuid=participation_uuid,
            login_server_timestamp__gte=two_days_ago,
        ).exclude(
            questions_info={},
        ).only(
            'questions_info',
        ).first()

        if previous_questions:
            participation.questions_info = previous_questions.questions_info
            
        with transaction.atomic():
            participation.save()
            VideoView.objects.bulk_create([
                VideoView(participation_id=participation.id, video_id=video.id)
                for video in videos
            ])

        print('Created new participation', participation_uuid)
    else:
        print('Existing participation', participation.uuid)

    # Select and send unseen videos
    videos = [vw.video for vw in VideoView.objects.filter(participation_id=participation.id, seen=False).prefetch_related('video')]
    print('Selected {} unseen videos'.format(len(videos)))

    new_participation = (participation.questions_info == {} and not experiment.fast_mode)

    response_data = {
        'participation_id': participation.id,
        'videos': VideoSerializer(videos, many=True).data,
        'new_participation': new_participation
    }
    return Response(response_data, status=status.HTTP_201_CREATED)


@csrf_exempt
@api_view(['POST'])
def video_view_result(request, format=None):
    client_serializer = VideoViewClientDataSerializer(data=request.data)
    if not client_serializer.is_valid():
        return Response(client_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    participation_uuid = request.session.get('participation_uuid')
    if not participation_uuid:
        return Response('User is not authorized', status=status.HTTP_401_UNAUTHORIZED)

    client_data = client_serializer.validated_data

    participation = get_or_none(Participation, id=client_data['participation'].id, uuid=participation_uuid)
    if participation is None:
        return Response('There are no participation with such id and uuid', status=status.HTTP_400_BAD_REQUEST)

    video_views_queryset = VideoView.objects.filter(participation_id=client_data['participation'].id)

    video_view = video_views_queryset.filter(video_id=client_data['video'].id).first()
    if video_view is None:
        return Response('There are no such video in the participation', status=status.HTTP_400_BAD_REQUEST)
    if video_view.seen:
        return Response('The video has been already seen', status=status.HTTP_400_BAD_REQUEST)

    # Update and save video view
    for attr in VideoViewClientDataSerializer.updatable_fields:
        setattr(video_view, attr, client_data[attr])
    video_view.seen = True
    video_view.server_timestamp = timezone.now()
    video_view.save()
    
    participation.update_completed()
    participation.save()

    answer = {
        'status': 'ok',
        'comment': ''
    }
    if participation.is_completed():
        answer['verification_code'] = str(participation.verification_code)

    return Response(answer, status=status.HTTP_201_CREATED)


@csrf_exempt
@api_view(['POST'])
def react_data(request, format=None):
    client_serializer = ParticipationReactInfoSerializer(data=request.data)
    if not client_serializer.is_valid():
        return Response(client_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    participation_uuid = request.session.get('participation_uuid')
    if not participation_uuid:
        return Response('User is not authorized', status=status.HTTP_401_UNAUTHORIZED)

    client_data = client_serializer.validated_data

    participation = get_or_none(Participation, id=client_data['id'], uuid=participation_uuid)
    if participation is None:
        return Response('There is no participation with such id and uuid', status=status.HTTP_400_BAD_REQUEST)

    participation.react_info = client_data['react_info']
    participation.save()

    answer = {
        'status': 'ok',
        'comment': ''
    }

    return Response(answer, status=status.HTTP_201_CREATED)


@csrf_exempt
@api_view(['POST'])
def questions_data(request, format=None):
    client_serializer = ParticipationQuestionsInfoSerializer(data=request.data)
    if not client_serializer.is_valid():
        return Response(client_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    participation_uuid = request.session.get('participation_uuid')
    if not participation_uuid:
        return Response('User is not authorized', status=status.HTTP_401_UNAUTHORIZED)

    client_data = client_serializer.validated_data

    participation = get_or_none(Participation, id=client_data['id'], uuid=participation_uuid)
    if participation is None:
        return Response('There are no participation with such id and uuid', status=status.HTTP_400_BAD_REQUEST)

    participation.questions_info = client_data['questions_info']
    participation.save()

    answer = {
        'status': 'ok',
        'comment': ''
    }

    return Response(answer, status=status.HTTP_201_CREATED)


@csrf_exempt
def get_experiment_views_data(request, experiment_id, format=None):
    video_views = VideoView.objects
    video_views = video_views.filter(participation__experiment_id=experiment_id, seen=True)
    video_views = video_views.values('participation_id', 'participation__uuid', 'participation__activation_code', 'video_id', 'video__path', 'data_gazes', 'data_fps')
    return JsonResponse(list(video_views), safe=False)


@csrf_exempt
def get_experiment_validation_views_data(request, experiment_id, format=None):
    video_views = VideoView.objects
    video_views = video_views.filter(participation__experiment_id=experiment_id, seen=True, video__is_validation=True)
    video_views = video_views.values('participation_id', 'participation__uuid', 'participation__activation_code', 'video_id', 'video__path', 'data_gazes', 'data_fps')
    return JsonResponse(list(video_views), safe=False)


@csrf_exempt
def get_participation_data(request, activation_code, format=None):
    participation = Participation.objects.filter(activation_code=activation_code).first()
    if participation is None:
        return Response('There are no participation with such id and uuid', status=status.HTTP_400_BAD_REQUEST)
    
    serializer = ParticipationAllInfoSerializer(participation)
    return JsonResponse(serializer.data, safe=False)


@csrf_exempt
def activation(request):
  if request.method != 'POST':
    return HttpResponse(status=status.HTTP_400_BAD_REQUEST)
  args = request.POST
  if 'verification' not in args or 'activation' not in args:
    return HttpResponse(status=status.HTTP_400_BAD_REQUEST)
  verification = args['verification']
  activation_code = args['activation']
  if not verification:
    return JsonResponse({'status': 'invalid'})

  participation = get_or_none(Participation, verification_code=verification)
  if participation is None:
    return JsonResponse({'status': 'invalid'})

  if participation.activation_code and participation.activation_code != activation_code:
    return JsonResponse({'status': 'used'})
  
  if activation_code == '-':
    return JsonResponse({'status': 'incorrect'})  

  participation.activation_code = activation_code
  participation.save()
  return JsonResponse({'status': 'ok'})

@csrf_exempt
@api_view(['POST'])
def admin_mode(request, format=None):
    client_serializer = ParticipationAdminModeSerializer(data=request.data)
    if not client_serializer.is_valid():
        return Response(client_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    participation_uuid = request.session.get('participation_uuid')
    if not participation_uuid:
        return Response('User is not authorized', status=status.HTTP_401_UNAUTHORIZED)

    client_data = client_serializer.validated_data

    participation = get_or_none(Participation, id=client_data['id'], uuid=participation_uuid)
    if participation is None:
        return Response('There are no participation with such id and uuid', status=status.HTTP_400_BAD_REQUEST)

    participation.admin_mode = True
    participation.save()

    answer = {
        'status': 'ok',
        'comment': ''
    }

    return Response(answer, status=status.HTTP_201_CREATED)

@csrf_exempt
@api_view(['GET', 'POST'])
def rotate_speed(request, format=None):
    participation_uuid = request.session.get('participation_uuid')
    if not participation_uuid:
        return Response({'error': 'User is not authorized'}, status=status.HTTP_401_UNAUTHORIZED)

    if request.method == 'GET':
        pid = request.GET.get('id')
        if not pid:
            return Response({'error': 'Missing id'}, status=status.HTTP_400_BAD_REQUEST)
        participation = get_or_none(Participation, id=pid, uuid=participation_uuid)
        if not participation:
            return Response({'error': 'Participation not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'rotate_speed': getattr(participation, 'rotate_speed', None)})

    # POST
    client_serializer = ParticipationRotateSpeedSerializer(data=request.data)
    if not client_serializer.is_valid():
        return Response(client_serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    client_data = client_serializer.validated_data
    participation = get_or_none(Participation, id=client_data['id'], uuid=participation_uuid)
    if not participation:
        return Response({'error': 'Participation not found'}, status=status.HTTP_404_NOT_FOUND)
    
    if not hasattr(participation, 'rotate_speed'):
        return Response({'error': 'rotate_speed field not available'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    participation.rotate_speed = client_data['rotate_speed']
    participation.save(update_fields=['rotate_speed'])
    return Response({'status': 'ok'}, status=status.HTTP_200_OK)

