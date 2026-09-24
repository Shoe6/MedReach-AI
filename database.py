import os
import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore, storage

load_dotenv()

IS_CLOUD_RUN = bool(os.environ.get("K_SERVICE"))
USE_EMULATOR = not IS_CLOUD_RUN and os.environ.get("USE_FIRESTORE_EMULATOR", "true").lower() != "false"

if USE_EMULATOR:
	os.environ["FIRESTORE_EMULATOR_HOST"] = "127.0.0.1:8080"
	os.environ.setdefault("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099")
	os.environ.setdefault("FIREBASE_STORAGE_EMULATOR_HOST", "http://127.0.0.1:9199")
	os.environ.setdefault("STORAGE_EMULATOR_HOST", "http://127.0.0.1:9199")

storage_bucket = os.environ.get(
	"FIREBASE_STORAGE_BUCKET",
	"demo-medreach-ai.appspot.com" if USE_EMULATOR else None,
)

if not firebase_admin._apps:
	app_options = {"projectId": "demo-project"} if USE_EMULATOR else {}
	firebase_credential = None
	if not USE_EMULATOR:
		credential_path = os.getenv("FIREBASE_CREDENTIALS_PATH")
		if credential_path:
			firebase_credential = credentials.Certificate(credential_path)
	if storage_bucket:
		app_options["storageBucket"] = storage_bucket
	if firebase_credential:
		firebase_admin.initialize_app(firebase_credential, options=app_options)
	else:
		firebase_admin.initialize_app(options=app_options)

db = firestore.client()
default_bucket = storage.bucket(name=storage_bucket) if storage_bucket else storage.bucket()

