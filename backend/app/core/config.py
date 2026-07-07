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
    osrm_route_url: str = Field(
        default="https://router.project-osrm.org",
        validation_alias=AliasChoices("osrm_route_url", "OSRM_ROUTE_URL"),
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
    TRAVEL_DEMO_MODE: bool = False

    WHATSAPP_API_TOKEN: str = ""
    WHATSAPP_PHONE_NUMBER_ID: str = ""

    # Twilio WhatsApp
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_FROM: str = ""  # e.g. whatsapp:+14155238886

    # Frontend base URL (change to deployed URL in production)
    FRONTEND_BASE_URL: str = "http://localhost:5173"
settings = Settings()
