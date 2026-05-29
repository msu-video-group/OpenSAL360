from django.db import models
from django.contrib.postgres.fields import JSONField
from computedfields.models import ComputedFieldsModel, computed
from ua_parser import user_agent_parser
from django.utils import timezone
from django.core.validators import MaxValueValidator, MinValueValidator
from django.core.exceptions import ValidationError
from . import utils
from uuid import uuid4


class Video(models.Model):
    path = models.CharField(max_length=200)
    is_validation = models.BooleanField(default=False)
    fps = models.FloatField(null=True, blank=True)
    duration = models.FloatField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if self.pk:
            original = type(self).objects.only('fps', 'duration').get(pk=self.pk)
            changed_fields = []
            if original.fps != self.fps:
                changed_fields.append('fps')
            if original.duration != self.duration:
                changed_fields.append('duration')
            if changed_fields:
                raise ValidationError(
                    '{} cannot be modified after the video is created.'.format(', '.join(changed_fields))
                )
        super().save(*args, **kwargs)

    @property
    def url(self):
        return '/static/experiment_video/' + self.path
    
    @property
    def name(self):
        return '_'.join(self.path.split('.')[:-1])
    
    @property
    def is_reversed(self):
        return self.name.split('_')[-1] == 'reversed'

    def __str__(self):
        markers = []
        if self.is_validation:
            markers.append("validation")
        if self.is_reversed:
            markers.append("reversed")
        marker_text = " [{}]".format(", ".join(markers)) if markers else ""
        return "#{:03d} {}{}".format(self.id, self.path, marker_text)

    class Meta:
        verbose_name = "Video"
        verbose_name_plural = "Videos"


class Experiment(models.Model):
    STANDARD = 'Standard'
    FPV = 'FPV'
    DYNAMIC = 'Dynamic'
    EDGE_HOVER = 'Edge-Hover'
    
    MODE_CHOICES = [
        (STANDARD, 'Standard'),
        (FPV, 'FPV'),
        (DYNAMIC, 'Dynamic'),
        (EDGE_HOVER, 'Edge-Hover'),
    ]
    
    name = models.CharField(max_length=200)
    videos = models.ManyToManyField(Video)
    num_participation_videos = models.IntegerField(default=20)
    num_validation_videos = models.IntegerField(default=0)
    num_views_by_video = models.IntegerField(default=35)
    relative_background_blur_radius = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(100000.0)], default=0.005)
    relative_gaze_size_percent = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(100.0)], default=20)
    is_active = models.BooleanField(default=True)
    with_audio = models.BooleanField(default=True)
    stars = models.BooleanField(default=True)
    random_start = models.BooleanField(default=False)
    field_of_view = models.FloatField(validators=[MinValueValidator(30.0), MaxValueValidator(150.0)], default=40)
    fast_mode = models.BooleanField(default=True)
    unseen_cursor = models.BooleanField(default=False)
    
    mode = models.CharField(
        max_length=20,
        choices=MODE_CHOICES,
        default=STANDARD,
        verbose_name="Mode"
    )
    
    def __str__(self):
        return '#{:03d} {} {}({})'.format(self.id, self.name, self.num_participation_videos, self.num_validation_videos, self.num_views_by_video)

    class Meta:
        verbose_name = "Experiment"
        verbose_name_plural = "Experiments"


class Participation(ComputedFieldsModel):
    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE)
    verification_code = models.UUIDField(default=uuid4, unique=True, db_index=True)
    uuid = models.UUIDField(db_index=True)
    activation_code = models.CharField(max_length=50, verbose_name=u'Activation', default='')
    rotate_speed = models.FloatField(null=True, blank=True, default=None)

    login_server_timestamp = models.DateTimeField(auto_now=True)
    login_user_agent = models.TextField()
    login_ip = models.GenericIPAddressField(unpack_ipv4=True)

    @computed(JSONField(default=dict))
    def login_user_agent_parsed(self):
        return user_agent_parser.Parse(self.login_user_agent)

    login_client_timestamp = models.DateTimeField(null=True)
    login_client_info = JSONField()

    react_info = JSONField(default=dict)
    questions_info = JSONField(default=dict)

    completed = models.BooleanField(default=False)
    admin_mode = models.BooleanField(default=False)
    
    def is_completed_full(self):
        experiment_videos = set(v.id for v in self.experiment.videos.all())
        seen_videos = set(vw.video_id for vw in VideoView.objects.filter(participation_id=self.id, seen=True))
        return len(seen_videos) > 0 and experiment_videos == seen_videos

    def update_completed(self):
        self.completed = VideoView.objects.filter(participation_id=self.id, seen=False).count() == 0

    def is_completed(self):
        return self.completed

    def __str__(self):
        return utils.get_participation_title(self)

    class Meta:
        verbose_name = "Participation"
        verbose_name_plural = "Participations"


class VideoView(models.Model):
    participation = models.ForeignKey(Participation, on_delete=models.CASCADE)
    video = models.ForeignKey(Video, on_delete=models.CASCADE)

    seen = models.BooleanField(default=False)
    server_timestamp = models.DateTimeField(null=True)
    client_timestamp_start = models.DateTimeField(null=True)
    client_timestamp_finish = models.DateTimeField(null=True)
    data_gazes = JSONField(default=dict)
    data_fps = JSONField(default=dict)
    video_score = models.IntegerField(default=0)

    @property
    def client_fps(self):
        timestamps = self.data_fps.get('render_video_timestamps')
        duration = self.data_fps.get('video_duration')
        if timestamps and duration:
            return len(timestamps) / duration
        else:
            return 0

    def __str__(self):
        return "{} {} {} {} {}".format(str(self.participation.experiment.id), str(self.participation.uuid), self.video.path, self.client_fps, self.seen)

    class Meta:
        verbose_name = "Video View"
        verbose_name_plural = "Video Views"


class VideoViewChunkData(models.Model):
    participation = models.ForeignKey(Participation, on_delete=models.CASCADE)
    video = models.ForeignKey(Video, on_delete=models.CASCADE)
    timestamp_server = models.DateTimeField()
    timestamp_client = models.DateTimeField()
    client_data = JSONField(default=dict)
