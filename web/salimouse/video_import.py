import glob
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from django.utils.text import get_valid_filename

import salimouse_site.settings as settings
from salimouse.models import Video


DEFAULT_DST_DIR = os.path.join(settings.STATICFILES_DIRS[0], "experiment_video")


def convert_video(video_src_path, video_dst_path, ffmpeg_bin="ffmpeg"):
    ffmpeg_path = shutil.which(ffmpeg_bin)
    if ffmpeg_path is None:
        raise RuntimeError(
            "ffmpeg executable not found: {}. Install ffmpeg or pass --ffmpeg-bin.".format(ffmpeg_bin)
        )

    src_path = os.path.abspath(video_src_path)
    dst_path = os.path.abspath(video_dst_path)
    dst_dir = os.path.dirname(dst_path)
    os.makedirs(dst_dir, exist_ok=True)

    fd, tmp_path = tempfile.mkstemp(prefix="convert_", suffix=".mp4", dir=dst_dir)
    os.close(fd)
    try:
        command = [
            ffmpeg_path,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            src_path,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-c:a",
            "aac",
            tmp_path,
        ]
        subprocess.run(command, check=True)
        os.replace(tmp_path, dst_path)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


def copy_videos(videos_dir, dst_dir=DEFAULT_DST_DIR, num_videos=10, ffmpeg_bin="ffmpeg"):
    os.makedirs(dst_dir, exist_ok=True)
    res_video_paths = []

    video_names = [
        fn for fn in os.listdir(videos_dir) if os.path.isdir(os.path.join(videos_dir, fn))
    ]
    videos_names = sorted(video_names)[:num_videos]

    for video_name in videos_names:
        video_dir = os.path.join(videos_dir, video_name)
        matches = glob.glob(os.path.join(video_dir, "*source.mp4"))
        if not matches:
            print("Skipping {}, no *source.mp4 found".format(video_name))
            continue

        video_src_path = matches[0]
        video_dst_path = os.path.join(dst_dir, video_name + ".mp4")

        if os.path.exists(video_dst_path):
            print(video_dst_path, "is already converted")
            continue

        convert_video(
            video_src_path,
            video_dst_path,
            ffmpeg_bin=ffmpeg_bin,
        )
        res_video_paths.append(video_dst_path)
    return res_video_paths


def get_video_metadata(video_path, ffprobe_bin="ffprobe"):
    ffprobe_path = shutil.which(ffprobe_bin)
    if ffprobe_path is None:
        raise RuntimeError(
            "ffprobe executable not found: {}. Install ffmpeg or pass a valid ffprobe binary.".format(ffprobe_bin)
        )

    command = [
        ffprobe_path,
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=r_frame_rate",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        video_path,
    ]
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    payload = json.loads(result.stdout)

    frame_rate = payload["streams"][0]["r_frame_rate"]
    numerator, denominator = frame_rate.split("/")
    fps = float(numerator) / float(denominator)
    duration = float(payload["format"]["duration"])
    return fps, duration


def add_videos_to_database(dst_dir=DEFAULT_DST_DIR, ffprobe_bin="ffprobe"):
    video_names = sorted([n for n in os.listdir(dst_dir) if n.endswith(".mp4")])

    for video_name in video_names:
        found_video_objects = Video.objects.filter(path__exact=video_name)
        if found_video_objects:
            continue

        print("Adding", video_name)
        video_full_path = os.path.join(dst_dir, video_name)
        fps, duration = get_video_metadata(video_full_path, ffprobe_bin=ffprobe_bin)
        Video.objects.create(path=video_name, fps=fps, duration=duration)


def _normalize_filename(filename, convert_to_mp4):
    source_name = Path(filename).name
    source_stem = get_valid_filename(Path(source_name).stem) or "video"
    suffix = ".mp4" if convert_to_mp4 else Path(source_name).suffix.lower()
    if not suffix:
        suffix = ".mp4"
    return source_stem + suffix


def _write_uploaded_file(uploaded_file, destination_path):
    with open(destination_path, "wb+") as destination:
        if hasattr(uploaded_file, "chunks"):
            chunks = uploaded_file.chunks()
        else:
            chunks = [uploaded_file.read()]
        for chunk in chunks:
            destination.write(chunk)


def register_video_file(video_full_path, video_name=None, is_validation=False, ffprobe_bin="ffprobe"):
    video_name = video_name or os.path.basename(video_full_path)
    if Video.objects.filter(path=video_name).exists():
        raise ValueError("Video '{}' is already registered.".format(video_name))

    fps, duration = get_video_metadata(video_full_path, ffprobe_bin=ffprobe_bin)
    return Video.objects.create(
        path=video_name,
        fps=fps,
        duration=duration,
        is_validation=is_validation,
    )


def import_uploaded_video(
    uploaded_file,
    dst_dir=DEFAULT_DST_DIR,
    is_validation=False,
    ffmpeg_bin="ffmpeg",
    ffprobe_bin="ffprobe",
):
    source_suffix = Path(uploaded_file.name).suffix.lower()
    convert_to_mp4 = source_suffix != ".mp4"
    video_name = _normalize_filename(uploaded_file.name, convert_to_mp4=convert_to_mp4)
    final_path = os.path.join(dst_dir, video_name)

    if os.path.exists(final_path):
        raise ValueError("File '{}' already exists.".format(video_name))
    if Video.objects.filter(path=video_name).exists():
        raise ValueError("Video '{}' is already registered.".format(video_name))

    os.makedirs(dst_dir, exist_ok=True)

    created_path = None
    temp_source_path = None
    try:
        if convert_to_mp4:
            fd, temp_source_path = tempfile.mkstemp(
                prefix="upload_",
                suffix=source_suffix or ".tmp",
                dir=dst_dir,
            )
            os.close(fd)
            _write_uploaded_file(uploaded_file, temp_source_path)
            convert_video(temp_source_path, final_path, ffmpeg_bin=ffmpeg_bin)
        else:
            _write_uploaded_file(uploaded_file, final_path)

        created_path = final_path
        return register_video_file(
            final_path,
            video_name=video_name,
            is_validation=is_validation,
            ffprobe_bin=ffprobe_bin,
        )
    except Exception:
        if created_path and os.path.exists(created_path):
            os.remove(created_path)
        raise
    finally:
        if temp_source_path and os.path.exists(temp_source_path):
            os.remove(temp_source_path)
