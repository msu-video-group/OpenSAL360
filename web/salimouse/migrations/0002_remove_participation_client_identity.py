from django.db import migrations, models


LEGACY_FIELD_NAMES = (
    "login_user_agent",
    "login_ip",
    "login_user_agent_parsed",
)


def remove_legacy_fields_if_present(apps, schema_editor):
    participation = apps.get_model("salimouse", "Participation")
    table_name = participation._meta.db_table

    with schema_editor.connection.cursor() as cursor:
        existing_columns = {
            column.name
            for column in schema_editor.connection.introspection.get_table_description(
                cursor,
                table_name,
            )
        }

    for field_name in LEGACY_FIELD_NAMES:
        if field_name in existing_columns:
            schema_editor.remove_field(
                participation,
                participation._meta.get_field(field_name),
            )


class Migration(migrations.Migration):
    dependencies = [
        ("salimouse", "0001_initial"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="experiment",
            options={
                "verbose_name": "Experiment",
                "verbose_name_plural": "Experiments",
            },
        ),
        migrations.AlterModelOptions(
            name="participation",
            options={
                "verbose_name": "Participation",
                "verbose_name_plural": "Participations",
            },
        ),
        migrations.AlterModelOptions(
            name="video",
            options={
                "verbose_name": "Video",
                "verbose_name_plural": "Videos",
            },
        ),
        migrations.AlterModelOptions(
            name="videoview",
            options={
                "verbose_name": "Video View",
                "verbose_name_plural": "Video Views",
            },
        ),
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AlterField(
                    model_name="participation",
                    name="login_client_info",
                    field=models.JSONField(),
                ),
                migrations.AlterField(
                    model_name="participation",
                    name="questions_info",
                    field=models.JSONField(default=dict),
                ),
                migrations.AlterField(
                    model_name="participation",
                    name="react_info",
                    field=models.JSONField(default=dict),
                ),
                migrations.AlterField(
                    model_name="videoview",
                    name="data_fps",
                    field=models.JSONField(default=dict),
                ),
                migrations.AlterField(
                    model_name="videoview",
                    name="data_gazes",
                    field=models.JSONField(default=dict),
                ),
                migrations.AlterField(
                    model_name="videoviewchunkdata",
                    name="client_data",
                    field=models.JSONField(default=dict),
                ),
            ],
        ),
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(remove_legacy_fields_if_present),
            ],
            state_operations=[
                migrations.RemoveField(
                    model_name="participation",
                    name="login_user_agent",
                ),
                migrations.RemoveField(
                    model_name="participation",
                    name="login_ip",
                ),
                migrations.RemoveField(
                    model_name="participation",
                    name="login_user_agent_parsed",
                ),
            ],
        ),
    ]
