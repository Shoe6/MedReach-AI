import os
import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore, storage

IS_CLOUD_RUN = bool(os.environ.get("K_SERVICE"))
if IS_CLOUD_RUN:
	for variable in ("FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST", "STORAGE_EMULATOR_HOST"):
		os.environ.pop(variable, None)
else:
	load_dotenv()
# Auth always uses Google's production verifier, even when Firestore is emulated.
os.environ.pop("FIREBASE_AUTH_EMULATOR_HOST", None)
USE_EMULATOR = not IS_CLOUD_RUN and os.environ.get("USE_FIRESTORE_EMULATOR", "true").lower() != "false"
FIREBASE_PROJECT_ID = "medreachai-679aa"

if USE_EMULATOR:
	os.environ["FIRESTORE_EMULATOR_HOST"] = "127.0.0.1:8080"
	os.environ.setdefault("FIREBASE_STORAGE_EMULATOR_HOST", "http://127.0.0.1:9199")
	os.environ.setdefault("STORAGE_EMULATOR_HOST", "http://127.0.0.1:9199")

storage_bucket = os.environ.get(
	"FIREBASE_STORAGE_BUCKET",
	"demo-medreach-ai.appspot.com" if USE_EMULATOR else "medreach-ai-uploads",
)

if not firebase_admin._apps:
	app_options = {"projectId": FIREBASE_PROJECT_ID}
	firebase_credential = None
	credential_path = os.getenv("FIREBASE_CREDENTIALS_PATH")
	if credential_path:
		firebase_credential = credentials.Certificate(credential_path)
	if storage_bucket:
		app_options["storageBucket"] = storage_bucket
	if firebase_credential:
		firebase_admin.initialize_app(firebase_credential, options=app_options)
	else:
		firebase_admin.initialize_app(options=app_options)

if firebase_admin.get_app().project_id != FIREBASE_PROJECT_ID:
	raise RuntimeError(f"Firebase Admin SDK must use project {FIREBASE_PROJECT_ID}.")

db = firestore.client()
default_bucket = storage.bucket(name=storage_bucket) if storage_bucket else storage.bucket()
