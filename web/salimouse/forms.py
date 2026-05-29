from django import forms
from django.forms.widgets import ClearableFileInput

from .models import Experiment


class MultiFileInput(ClearableFileInput):
    allow_multiple_selected = True


class ExperimentAdminForm(forms.ModelForm):
    class Meta:
        model = Experiment
        exclude = ("num_participation_videos", "num_validation_videos")

    def save(self, commit=True):
        instance = super().save(commit=False)
        videos = self.cleaned_data.get("videos")
        if videos is not None:
            instance.num_validation_videos = sum(1 for video in videos if video.is_validation)
            instance.num_participation_videos = sum(1 for video in videos if not video.is_validation)
        if commit:
            instance.save()
            self.save_m2m()
        return instance


class VideoAdminUploadForm(forms.Form):
    videos = forms.FileField(
        widget=MultiFileInput(attrs={"multiple": True}),
        help_text="Upload one or more videos. Non-MP4 files will be converted to MP4 if ffmpeg is available.",
    )
