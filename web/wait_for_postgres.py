import psycopg2
import time

from salimouse_site.config import get_env

host = get_env('DB_HOST', default='db')
db_name = get_env('POSTGRES_DB', default='salimouse')
user = get_env('POSTGRES_USER', default='salimouse')
password = get_env('POSTGRES_PASSWORD', default='change-me')

while True:
  try:
    psycopg2.connect(host=host, user=user, password=password, dbname=db_name)
    break
  except psycopg2.Error as ex:
    time.sleep(0.5)
