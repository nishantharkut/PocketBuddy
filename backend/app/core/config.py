from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    JWT_SECRET: str
    MONGO_URI: str
    PORT: int = 8000
    google_maps_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("google_maps_api_key", "GOOGLE_MAPS_API_KEY"),
    )
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_SESSION_TOKEN: str = ""
    AWS_REGION: str = "ap-south-1"
    CAMPUS_FOOD_S3_BUCKET: str = ""
    CAMPUS_FOOD_S3_KEY: str = "campus_food.json"
    BEDROCK_ENABLED: bool = False
    BEDROCK_REGION: str = "us-east-1"
    BEDROCK_MODEL_ID: str = "us.amazon.nova-lite-v1:0"

    WHATSAPP_API_TOKEN: str = ""
    WHATSAPP_PHONE_NUMBER_ID: str = ""

    # Twilio WhatsApp
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_FROM: str = ""  # e.g. whatsapp:+14155238886

    # Frontend base URL (change to deployed URL in production)
    FRONTEND_BASE_URL: str = "http://localhost:5173"

    # Demo-only phone auth is disabled by default because the current phone
    # path does not integrate a real OTP provider. Email/password remains the
    # normal local/dev auth flow.
    DEMO_PHONE_AUTH_ENABLED: bool = False
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080
    CORS_ALLOW_ORIGINS: str = ""

    # Android connector trust boundary. Legacy raw notification ingest remains
    # available only when explicitly enabled for migration from old connector
    # builds. New connector builds use notification-v2, on-device parsing, and
    # signed requests.
    CONNECTOR_LEGACY_RAW_INGEST_ENABLED: bool = False
    CONNECTOR_SIGNATURE_REQUIRED: bool = False
    CONNECTOR_SIGNATURE_TOLERANCE_SECONDS: int = 300

    # Account Aggregator style consent sandbox. This is local demo data only,
    # so it is enabled by default and never connects to live bank accounts.
    AA_SANDBOX_ENABLED: bool = True
    AA_SANDBOX_PROVIDER: str = "local"
    AA_SANDBOX_BASE_URL: str = ""
    AA_CLIENT_ID: str = ""
    AA_CLIENT_SECRET: str = ""
    AA_FIU_ID: str = ""
    AA_CALLBACK_SECRET: str = ""
    AA_INSTITUTION_REGISTRY_URL: str = ""

    DEMO_MODE: bool = False
    OCR_PROVIDER: str = "ocrspace"
    OCR_SPACE_API_KEY: str = ""
settings = Settings()
