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

    class Config:
        env_file = ".env"
settings = Settings()
