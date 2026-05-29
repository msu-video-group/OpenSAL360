# OpenSAL360

An open-source web platform for collecting mouse-based saliency data on omnidirectional videos.

OpenSAL360 provides a streamlined browser-based workflow for saliency crowdsourcing experiments, together with tools for transforming mouse-based gaze data into fixations and saliency maps.

<img width="1957" height="962" alt="OpenSal360" src="https://github.com/user-attachments/assets/a7f433fb-de6e-41bb-aebd-9d6f415924c9" />

## Demo Video :clapper:

Please make sure audio is enabled while watching the demo video.

[Watch the demo video](https://github.com/user-attachments/assets/f5f0d2de-f1f5-4043-8ce9-344b7921262f)

## Try the Demo :sparkles:

You can explore a live version of OpenSAL360 through our public demo. Completing it takes about 5 minutes and is a convenient way to see how the system works in practice.

[Open the live demo](http://saliency.subjectify.online/experiment/1/)

## Dataset :card_index_dividers:
[![Dataset](https://huggingface.co/datasets/huggingface/badges/resolve/main/dataset-on-hf-md.svg)](https://huggingface.co/datasets/ANDRYHA/OpenSAL360)

The dataset collected with OpenSAL360, comprising 500 videos, is publicly available on Hugging Face:

[Explore the dataset on Hugging Face](https://huggingface.co/datasets/ANDRYHA/OpenSAL360)

## What It Offers :stars:

- Browser-based participant experience with no custom client installation
- Researcher-friendly Django admin interface
- Video upload and experiment configuration workflow
- Mouse-based saliency collection for omnidirectional videos
- Export and processing pipeline for fixations and saliency maps

## Quick Start :rocket:

1. Configure `docker/.env`.
2. Start the debug stack with `docker compose -f docker-compose.debug.yml up`.
3. Create an admin user with `docker compose -f docker-compose.debug.yml exec web python manage.py createsuperuser`.
4. Open the admin panel at `http://localhost/admin/`, then add videos and create an experiment.
5. Open the platform at `http://localhost/`.

See [Local Quick Start](https://github.com/msu-video-group/VideoSaliency360/wiki/Local-Quick-Start) for the full setup details.

## Documentation :books:

Extended documentation is available in the [GitHub Wiki](https://github.com/msu-video-group/VideoSaliency360/wiki):

- [Wiki Home](https://github.com/msu-video-group/VideoSaliency360/wiki)
- [Local Quick Start](https://github.com/msu-video-group/VideoSaliency360/wiki/Local-Quick-Start)
- [Production Deployment](https://github.com/msu-video-group/VideoSaliency360/wiki/Production-Deployment)
- [Admin Guide](https://github.com/msu-video-group/VideoSaliency360/wiki/Admin-Guide)
- [Data Models](https://github.com/msu-video-group/VideoSaliency360/wiki/Data-Models)
- [Processing](https://github.com/msu-video-group/VideoSaliency360/wiki/Processing)
- [Backup and Restore](https://github.com/msu-video-group/VideoSaliency360/wiki/Backup-and-Restore)

## Citation :mortar_board:

`TODO: add a BibTeX entry`
