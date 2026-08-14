from django import forms
from django.forms.widgets import ClearableFileInput

from .models import Experiment


class MultiFileInput(ClearableFileInput):
    allow_multiple_selected = True


class MultipleFileField(forms.FileField):
    widget = MultiFileInput

    def clean(self, data, initial=None):
        clean_one_file = super().clean
        if isinstance(data, (list, tuple)):
            if not data:
                cleaned = clean_one_file(None, initial)
                return [] if cleaned is None else [cleaned]
            return [clean_one_file(file_data, initial) for file_data in data]
        return [clean_one_file(data, initial)]


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
    videos = MultipleFileField(
        widget=MultiFileInput(attrs={"multiple": True}),
        help_text="Upload one or more videos. Non-MP4 files will be converted to MP4 if ffmpeg is available.",
    )
