import os


def get_env(name, default=None, required=False):
    value = os.environ.get(name, default)
    if required and value in (None, ""):
        raise KeyError(f"Missing required environment variable: {name}")
    return value


def get_bool_env(name, default=False):
    value = get_env(name, default)
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def get_list_env(name, default=None, separator=","):
    value = get_env(name)
    if value in (None, ""):
        return list(default or [])
    return [item.strip() for item in str(value).split(separator) if item.strip()]
