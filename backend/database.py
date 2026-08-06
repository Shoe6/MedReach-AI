import os
import firebase_admin
from firebase_admin import credentials, firestore

# Force the Admin SDK to target your local emulator ports
os.environ["FIRESTORE_EMULATOR_HOST"] = "127.0.0.1:8080"
os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"

# Initialize the app using a mock project ID
if not firebase_admin._apps:
    dummy_cred = credentials.Certificate({
        "type": "service_account",
        "project_id": "demo-medreach-ai",
        "private_key_id": "mock-key",
        "private_key": "-----BEGIN PRIVATE KEY-----\nmock-key\n-----END PRIVATE KEY-----\n",
        "client_email": "mock@demo-medreach-ai.iam.gserviceaccount.com",
        "client_id": "mock-id",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": "mock-url"
    })
    firebase_admin.initialize_app(dummy_cred, {'projectId': 'demo-medreach-ai'})

# Export the db instance for your FastAPI endpoints to use
db = firestore.client()