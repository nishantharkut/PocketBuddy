from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    JWT_SECRET: str
    MONGO_URI: str
    PORT: int = 8000
    photon_geocoder_url: str = Field(
        default="https://photon.komoot.io",
        validation_alias=AliasChoices("photon_geocoder_url", "PHOTON_GEOCODER_URL"),
    )
    nominatim_geocoder_url: str = Field(
        default="https://nominatim.openstreetmap.org",
        validation_alias=AliasChoices("nominatim_geocoder_url", "NOMINATIM_GEOCODER_URL"),
    )
    osrm_route_url: str = Field(
        default="https://router.project-osrm.org",
        validation_alias=AliasChoices("osrm_route_url", "OSRM_ROUTE_URL"),
    )
    travel_geo_user_agent: str = Field(
        default="PocketBuddy-TravelGuard/1.0 (https://github.com/nishantharkut/PocketBuddy)",
        validation_alias=AliasChoices("travel_geo_user_agent", "TRAVEL_GEO_USER_AGENT"),
    )
    travel_geo_cache_enabled: bool = Field(
        default=True,
        validation_alias=AliasChoices("travel_geo_cache_enabled", "TRAVEL_GEO_CACHE_ENABLED"),
    )
    travel_geocode_cache_ttl_days: int = Field(
        default=30,
        validation_alias=AliasChoices("travel_geocode_cache_ttl_days", "TRAVEL_GEOCODE_CACHE_TTL_DAYS"),
    )
    travel_route_cache_ttl_days: int = Field(
        default=7,
        validation_alias=AliasChoices("travel_route_cache_ttl_days", "TRAVEL_ROUTE_CACHE_TTL_DAYS"),
    )
    TOMTOM_API_KEY: str = ""
    TOMTOM_ROUTE_URL: str = "https://api.tomtom.com"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_SESSION_TOKEN: str = ""
    AWS_REGION: str = "ap-south-1"
    CAMPUS_FOOD_S3_BUCKET: str = ""
    CAMPUS_FOOD_S3_KEY: str = "campus_food.json"
    BEDROCK_ENABLED: bool = False
    BEDROCK_REGION: str = "us-east-1"
    BEDROCK_MODEL_ID: str = "us.amazon.nova-lite-v1:0"
    TRAVEL_DEMO_MODE: bool = False

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

    # Account Aggregator sandbox integration. Disabled by default so the app
    # never pretends to verify live bank data without explicit configuration.
    AA_SANDBOX_ENABLED: bool = False
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
