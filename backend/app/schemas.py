from pydantic import BaseModel, ConfigDict, Field
from typing import Optional

class LoginInput(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)

class RegisterInput(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=8, max_length=256)
    full_name: str = Field(default="", max_length=160)
    email: str = Field(default="", max_length=255)

class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=160)
    email: Optional[str] = Field(default=None, max_length=255)
    password: Optional[str] = Field(default=None, min_length=8, max_length=256)

class OfficerInput(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    department: str = Field(default="Not specified", max_length=180)
    current_role: str = Field(default="Not specified", max_length=160)
    target_role: str = Field(default="Not specified", max_length=160)
    readiness: float = Field(default=0, ge=0, le=100)
    open_gaps: int = Field(default=0, ge=0, le=1000)
    skills: list[str] = []
    missing_skills: list[str] = []
    assessment_source: str = Field(default="User-entered; unverified", max_length=255)
    assessment_date: str = Field(default="", max_length=40)
    years_in_role: int = Field(default=0, ge=0, le=50)
    qualification: str = Field(default="", max_length=200)
    is_demo: bool = True

class OfficerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    department: str
    current_role: str
    target_role: str
    readiness: float
    open_gaps: int
    skills: str
    missing_skills: str
    assessment_source: str
    assessment_date: str
    years_in_role: int
    qualification: str
    is_demo: bool

class SkillInput(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    domain: str = Field(default="General", max_length=100)
    description: str = ""
    source_reference: str = Field(default="", max_length=500)
    review_status: str = Field(default="Pending review", max_length=40)

class RoleInput(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    grade: str = Field(default="Not specified", max_length=100)
    description: str = ""
    source_reference: str = Field(default="", max_length=500)
    review_status: str = Field(default="Pending review", max_length=40)
    required_skills: list[str] = []

class CourseInput(BaseModel):
    name: str = Field(min_length=1, max_length=220)
    provider: str = Field(default="Unverified provider", max_length=180)
    skill_name: str = Field(default="", max_length=180)
    domain: str = Field(default="General", max_length=100)
    duration: str = Field(default="Not specified", max_length=80)
    url: str = Field(default="", max_length=1000)
    source_reference: str = Field(default="", max_length=500)
    verified: bool = False
