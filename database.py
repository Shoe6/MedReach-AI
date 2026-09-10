import os
import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore, storage

load_dotenv()

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
storage_bucket = os.environ.get("FIREBASE_STORAGE_BUCKET", "demo-medreach-ai.appspot.com")

if ENVIRONMENT == "production":
    if not firebase_admin._apps:
        cred = credentials.Certificate(os.getenv("FIREBASE_CREDENTIALS_PATH"))
        firebase_admin.initialize_app(
            cred,
            options={
                "projectId": os.getenv("FIREBASE_PROJECT_ID"),
                "storageBucket": storage_bucket,
            },
        )
else:
    os.environ["FIRESTORE_EMULATOR_HOST"] = "127.0.0.1:8080"
    os.environ.setdefault("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099")
    os.environ.setdefault("FIREBASE_STORAGE_EMULATOR_HOST", "http://127.0.0.1:9199")
    os.environ.setdefault("STORAGE_EMULATOR_HOST", "http://127.0.0.1:9199")

    if not firebase_admin._apps:
        firebase_admin.initialize_app(
            options={
                "projectId": "demo-project",
                "storageBucket": storage_bucket,
            }
        )

db = firestore.client()
default_bucket = storage.bucket(name=storage_bucket)