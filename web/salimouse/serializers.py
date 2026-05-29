from rest_framework import serializers
from salimouse.models import Video, VideoView, Participation


class VideoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Video
        fields = ('id', 'url', 'is_validation')


class ParticipationCreateRequestSerializer(serializers.Serializer):
    timestamp = serializers.DateTimeField()
    client_info = serializers.JSONField()


class ParticipationReactInfoSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField()
    class Meta:
        model = Participation
        fields = ('id', 'react_info')


class ParticipationQuestionsInfoSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField()
    class Meta:
        model = Participation
        fields = ('id', 'questions_info')


class ParticipationAllInfoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Participation
        fields = ('experiment', 'uuid', 'activation_code', 'login_server_timestamp', 'login_user_agent', 
                  'login_ip', 'login_client_timestamp', 'login_client_info', 'react_info', 'questions_info')


class VideoViewSerializer(serializers.ModelSerializer):
    class Meta:
        model = VideoView
        fields = ('participation_id', 'video_id', 'data_gazes', 'data_fps')


class VideoViewClientDataSerializer(serializers.ModelSerializer):
    updatable_fields = (
        'client_timestamp_start',
        'client_timestamp_finish',
        'data_gazes',
        'data_fps',
        'video_score',
    )

    class Meta:
        model = VideoView
        fields = (
            'participation',
            'video',
            'client_timestamp_start',
            'client_timestamp_finish',
            'data_gazes',
            'data_fps',
            'video_score',
        )


class ParticipationAdminModeSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField()
    class Meta:
        model = Participation
        fields = ('id', )

class ParticipationRotateSpeedSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    rotate_speed = serializers.FloatField(allow_null=True)
