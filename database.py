import os
import firebase_admin
from firebase_admin import firestore

os.environ["FIRESTORE_EMULATOR_HOST"] = "127.0.0.1:8080"
os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"

if not firebase_admin._apps:
    firebase_admin.initialize_app(options={"projectId": "demo-medreach-ai"})

db = firestore.client()