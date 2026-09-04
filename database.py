import os
import firebase_admin
from firebase_admin import firestore, storage

os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
os.environ.setdefault("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099")
os.environ.setdefault("FIREBASE_STORAGE_EMULATOR_HOST", "http://127.0.0.1:9199")
os.environ.setdefault("STORAGE_EMULATOR_HOST", "http://127.0.0.1:9199")

storage_bucket = os.environ.get("FIREBASE_STORAGE_BUCKET", "demo-medreach-ai.appspot.com")

if not firebase_admin._apps:
    firebase_admin.initialize_app(
        options={
            "projectId": "demo-medreach-ai",
            "storageBucket": storage_bucket,
        }
    )

db = firestore.client()
default_bucket = storage.bucket(name=storage_bucket)