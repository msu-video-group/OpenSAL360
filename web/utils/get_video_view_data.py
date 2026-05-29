import os
import sys
import glob
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "salimouse_site.settings")
import django
django.setup()

from salimouse.models import Video, VideoView


if __name__ == "__main__":
    data = VideoView.objects.all().values()
    print(json.dumps(list(data)))
