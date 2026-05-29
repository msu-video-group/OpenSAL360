from django.urls import path
from rest_framework.urlpatterns import format_suffix_patterns
from functools import partial

from . import views

urlpatterns = [
    path('',
         views.index, name='index'),
    path('experiment/<int:experiment_id>/',
         views.experiment, name='experiment'),
    path('payment_activation/',
         views.activation, name='payment-activation'),
    path('experiment_data/<int:experiment_id>/',
         views.get_experiment_views_data, name='experiment-view-data'),
    path('experiment_val_data/<int:experiment_id>/',
         views.get_experiment_validation_views_data, name='experiment-val-view-data'),
    path('participation_data/<int:activation_code>/',
         views.get_participation_data, name='participation-data'),
]

# Rest framework API
urlpatterns += format_suffix_patterns([
     path('get_participation_<int:experiment_id>/',
         views.participation_create_request, name='get-participation'),
     path('video_view_result/',
         views.video_view_result, name='video-view-result'),
     path('react_info/',
         views.react_data, name='react-info'),
     path('questions_info/',
         views.questions_data, name='questions-info'),
     path('admin_mode/',
         views.admin_mode, name='admin-mode'),
     path('rotate_speed/',
         views.rotate_speed, name='rotate-speed'),
])
