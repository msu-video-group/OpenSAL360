from django.contrib import admin, messages
from django.contrib.auth.admin import GroupAdmin as DjangoGroupAdmin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.models import Group, User
from django.core.exceptions import PermissionDenied
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import path, reverse
from django.utils.html import format_html

from .forms import ExperimentAdminForm, VideoAdminUploadForm
from .models import Video, Experiment, Participation, VideoView
from .video_import import import_uploaded_video

admin.site.site_header = "OpenSAL360"
admin.site.site_title = "OpenSAL360"
admin.site.index_title = "OpenSAL360"


class BooleanStateFilter(admin.SimpleListFilter):
    title = ""
    parameter_name = ""
    yes_label = "Yes"
    no_label = "No"

    def lookups(self, request, model_admin):
        return (
            ("1", self.yes_label),
            ("0", self.no_label),
        )

    def queryset(self, request, queryset):
        if self.value() == "1":
            return queryset.filter(**{self.parameter_name: True})
        if self.value() == "0":
            return queryset.filter(**{self.parameter_name: False})
        return queryset


class VideoTypeFilter(BooleanStateFilter):
    title = "Type"
    parameter_name = "is_validation"
    yes_label = "Validation"
    no_label = "Regular"


class ExperimentStatusFilter(BooleanStateFilter):
    title = "Status"
    parameter_name = "is_active"
    yes_label = "Active"
    no_label = "Not active"


class CompletionStatusFilter(BooleanStateFilter):
    title = "Status"
    parameter_name = "completed"
    yes_label = "Completed"
    no_label = "Not completed"


class AdminModeFilter(BooleanStateFilter):
    title = "Admin mode"
    parameter_name = "admin_mode"
    yes_label = "Enabled"
    no_label = "Disabled"


class SeenStatusFilter(BooleanStateFilter):
    title = "Status"
    parameter_name = "seen"
    yes_label = "Seen"
    no_label = "Not seen"


class VideoViewTypeFilter(BooleanStateFilter):
    title = "Video type"
    parameter_name = "video__is_validation"
    yes_label = "Validation"
    no_label = "Regular"


admin.site.unregister(User)
admin.site.unregister(Group)


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    change_form_template = "admin/salimouse/change_form.html"
    change_list_template = "admin/salimouse/change_list.html"


@admin.register(Group)
class GroupAdmin(DjangoGroupAdmin):
    change_form_template = "admin/salimouse/change_form.html"
    change_list_template = "admin/salimouse/change_list.html"


@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    change_list_template = "admin/salimouse/change_list.html"
    change_form_template = "admin/salimouse/change_form.html"
    readonly_fields = ('fps', 'duration')
    list_display = ("id", "name_link", "is_validation", "fps", "duration")
    list_filter = (VideoTypeFilter,)
    search_fields = ("path",)

    def name_link(self, obj):
        url = reverse("admin:salimouse_video_change", args=[obj.pk])
        return format_html('<a href="{}">{}</a>', url, obj.path)

    name_link.short_description = "Name"

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "upload/",
                self.admin_site.admin_view(self.upload_view),
                name="salimouse_video_upload",
            ),
        ]
        return custom_urls + urls

    def add_view(self, request, form_url="", extra_context=None):
        return redirect("admin:salimouse_video_upload")

    def upload_view(self, request):
        if not self.has_add_permission(request):
            raise PermissionDenied

        form = VideoAdminUploadForm(request.POST or None, request.FILES or None)
        if request.method == "POST" and form.is_valid():
            uploaded_files = request.FILES.getlist("videos")
            validation_indexes = set(request.POST.getlist("validation_files"))
            created_videos = []
            errors = []

            for index, uploaded_file in enumerate(uploaded_files):
                try:
                    video = import_uploaded_video(
                        uploaded_file,
                        is_validation=str(index) in validation_indexes,
                    )
                    self.log_addition(request, video, "Added via upload.")
                    created_videos.append(video)
                except Exception as exc:
                    errors.append("{}: {}".format(uploaded_file.name, exc))

            if created_videos:
                messages.success(
                    request,
                    "Uploaded {} video(s): {}.".format(
                        len(created_videos),
                        ", ".join(video.path for video in created_videos),
                    ),
                )
            for error in errors:
                messages.error(request, error)

            if created_videos and not errors:
                return redirect("admin:salimouse_video_changelist")

        context = {
            **self.admin_site.each_context(request),
            "opts": self.model._meta,
            "form": form,
            "title": "Add videos",
        }
        return render(request, "admin/salimouse/video/upload.html", context)


@admin.register(Experiment)
class ExperimentAdmin(admin.ModelAdmin):
    change_form_template = "admin/salimouse/experiment/change_form.html"
    change_list_template = "admin/salimouse/change_list.html"
    form = ExperimentAdminForm
    filter_horizontal = ("videos",)
    list_display = (
        "id",
        "name_link",
        "mode",
        "is_active",
        "num_participation_videos",
        "num_validation_videos",
        "num_views_by_video",
        "preview_link",
        "duplicate_link",
    )
    list_filter = (ExperimentStatusFilter,)
    search_fields = ("name", "videos__path")

    def name_link(self, obj):
        url = reverse("admin:salimouse_experiment_change", args=[obj.pk])
        return format_html('<a href="{}">{}</a>', url, obj.name)

    name_link.short_description = "Name"

    def formfield_for_manytomany(self, db_field, request=None, **kwargs):
        formfield = super().formfield_for_manytomany(db_field, request=request, **kwargs)
        if db_field.name == "videos":
            widget = formfield.widget
            for attr in (
                "can_add_related",
                "can_change_related",
                "can_delete_related",
                "can_view_related",
            ):
                if hasattr(widget, attr):
                    setattr(widget, attr, False)
        return formfield

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "<path:object_id>/duplicate/",
                self.admin_site.admin_view(self.duplicate_view),
                name="salimouse_experiment_duplicate",
            ),
        ]
        return custom_urls + urls

    def preview_link(self, obj):
        url = reverse("experiment", kwargs={"experiment_id": obj.pk})
        return format_html('<a href="{}" target="_blank" rel="noopener">Preview</a>', url)

    preview_link.short_description = "Preview"

    def duplicate_link(self, obj):
        url = reverse("admin:salimouse_experiment_duplicate", args=[obj.pk])
        return format_html('<a href="{}">Duplicate</a>', url)

    duplicate_link.short_description = "Duplicate"

    def duplicate_view(self, request, object_id):
        if not self.has_add_permission(request):
            raise PermissionDenied

        source = get_object_or_404(Experiment, pk=object_id)
        source_videos = list(source.videos.all())
        clone = Experiment()
        for field in source._meta.concrete_fields:
            if field.primary_key:
                continue
            setattr(clone, field.attname, getattr(source, field.attname))

        clone.name = "{} (copy)".format(source.name)
        clone.num_validation_videos = sum(1 for video in source_videos if video.is_validation)
        clone.num_participation_videos = sum(1 for video in source_videos if not video.is_validation)
        clone.save()
        clone.videos.set(source_videos)
        self.log_addition(request, clone, "Duplicated from '{}'.".format(source.name))

        messages.success(
            request,
            "Experiment '{}' duplicated as '{}'.".format(source.name, clone.name),
        )
        return HttpResponseRedirect(
            reverse("admin:salimouse_experiment_change", args=[clone.pk])
        )


@admin.register(Participation)
class ParticipationAdmin(admin.ModelAdmin):
    change_form_template = "admin/salimouse/change_form_no_history.html"
    change_list_template = "admin/salimouse/change_list.html"
    list_display = (
        "id",
        "experiment_link",
        "uuid_link",
        "activation_code",
        "completed",
        "admin_mode",
        "login_server_timestamp",
    )
    list_filter = (CompletionStatusFilter, AdminModeFilter, "experiment")
    search_fields = ("uuid", "activation_code", "verification_code")
    readonly_fields = ("verification_code", "login_server_timestamp")

    def experiment_link(self, obj):
        url = reverse("admin:salimouse_experiment_change", args=[obj.experiment_id])
        return format_html('<a href="{}">{}</a>', url, obj.experiment)

    experiment_link.short_description = "Experiment"

    def uuid_link(self, obj):
        url = reverse("admin:salimouse_participation_change", args=[obj.pk])
        return format_html('<a href="{}">{}</a>', url, obj.uuid)

    uuid_link.short_description = "UUID"

    def history_view(self, request, object_id, extra_context=None):
        return redirect("admin:salimouse_participation_change", object_id)


@admin.register(VideoView)
class VideoViewAdmin(admin.ModelAdmin):
    change_form_template = "admin/salimouse/change_form_no_history.html"
    change_list_template = "admin/salimouse/change_list.html"
    list_display = (
        "id",
        "experiment_link",
        "participation_link",
        "video_link",
        "seen",
        "video_score",
        "server_timestamp",
    )
    list_filter = (SeenStatusFilter, "participation__experiment", VideoViewTypeFilter)
    search_fields = (
        "participation__uuid",
        "participation__activation_code",
        "video__path",
    )

    def experiment_link(self, obj):
        url = reverse("admin:salimouse_experiment_change", args=[obj.participation.experiment_id])
        return format_html('<a href="{}">{}</a>', url, obj.participation.experiment.name)

    experiment_link.short_description = "Experiment"

    def participation_link(self, obj):
        url = reverse("admin:salimouse_participation_change", args=[obj.participation_id])
        return format_html('<a href="{}">{}</a>', url, obj.participation)

    participation_link.short_description = "Participation"

    def video_link(self, obj):
        url = reverse("admin:salimouse_video_change", args=[obj.video_id])
        return format_html('<a href="{}">{}</a>', url, obj.video.path)

    video_link.short_description = "Video"

    def history_view(self, request, object_id, extra_context=None):
        return redirect("admin:salimouse_videoview_change", object_id)
