import os
import json

try:
    from pydantic_settings import BaseSettings
except ImportError:
    BaseSettings = object

class Settings:
    def __init__(self):
        self.BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        self.UPLOAD_DIR = os.path.join(self.BASE_DIR, "data", "uploads")
        self.CHROMA_DIR = os.path.join(self.BASE_DIR, "data", "chroma")
        self.SETTINGS_FILE = os.path.join(self.BASE_DIR, "data", "settings.json")
        
        os.makedirs(self.UPLOAD_DIR, exist_ok=True)
        os.makedirs(self.CHROMA_DIR, exist_ok=True)
        
        self.OPENAI_API_KEY = ""
        self.MOCK_MODE = False
        
        self.load_settings()

    def load_settings(self):
        if os.path.exists(self.SETTINGS_FILE):
            try:
                with open(self.SETTINGS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.OPENAI_API_KEY = data.get("OPENAI_API_KEY", "")
                    self.MOCK_MODE = data.get("MOCK_MODE", False)
                    print(f"Loaded settings from config: MOCK_MODE={self.MOCK_MODE}, API key present={'Yes' if self.OPENAI_API_KEY else 'No'}")
                    return
            except Exception as e:
                print(f"Error loading settings file: {e}")

        self.OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
        if not self.OPENAI_API_KEY:
            print("WARNING: OPENAI_API_KEY env variable not found. AutoDocIQ will run in GRACEFUL MOCK MODE.")
            self.MOCK_MODE = True
        else:
            print("OPENAI_API_KEY detected. AutoDocIQ will run in LIVE AI MODE.")
            self.MOCK_MODE = False

    def save_settings(self, api_key: str, mock_mode: bool):
        self.OPENAI_API_KEY = api_key
        self.MOCK_MODE = mock_mode
        try:
            with open(self.SETTINGS_FILE, "w", encoding="utf-8") as f:
                json.dump({
                    "OPENAI_API_KEY": self.OPENAI_API_KEY,
                    "MOCK_MODE": self.MOCK_MODE
                }, f, indent=2)
            print("Successfully saved settings to settings.json")
        except Exception as e:
            print(f"Failed to save settings: {e}")

settings = Settings()

