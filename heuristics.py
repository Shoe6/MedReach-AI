"""
Healthcare-specific heuristic column type detection engine.

This module infers data types for columns in healthcare datasets,
identifying NPI, state codes, emails, phone numbers, and HIPAA-related fields
like Has_Opted_In booleans.
"""
import re
from typing import Any


# Regular expression patterns for healthcare field detection
NPI_PATTERN = re.compile(r"^\d{10}$")
EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
PHONE_PATTERN = re.compile(r"^(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$")
STATE_PATTERN = re.compile(r"^[A-Z]{2}$")
SPECIALTY_PATTERN = re.compile(r"^[A-Za-z\s&\-/,]+$")

# Boolean value patterns
BOOLEAN_TRUE_VALUES = {"true", "yes", "y", "1", "on", "enabled", "opt-in", "opted-in"}
BOOLEAN_FALSE_VALUES = {"false", "no", "n", "0", "off", "disabled", "opt-out", "opted-out"}

# Healthcare field synonyms for header-name fallback detection
FIELD_SYNONYMS = {
    "npi": {"npi", "provider_id", "providerid", "physician_id", "physicianid", "md_number"},
    "email": {"email", "email_address", "emailaddress", "e_mail"},
    "phone": {"phone", "phone_number", "phonenumber", "telephone", "mobile", "cell"},
    "practiceState": {
        "practice_state",
        "practicestate",
        "state",
        "practice_location_state",
        "location_state",
    },
    "firstName": {"first_name", "firstname", "fname", "given_name", "givenname"},
    "lastName": {"last_name", "lastname", "lname", "surname", "family_name", "familyname"},
    "specialty": {"specialty", "speciality", "provider_specialty", "medical_specialty"},
    "boolean": {
        "has_opted_in",
        "hasoptedin",
        "opted_in",
        "optedin",
        "opt_in",
        "optin",
        "consent",
        "agreement",
        "active",
    },
}


def normalize_value(value: Any) -> str:
    """Normalize a value to string for type detection."""
    if value is None or (isinstance(value, float) and str(value) == "nan"):
        return ""
    return str(value).strip()


def is_npi(value: str) -> bool:
    """Check if value matches NPI (10-digit number) pattern."""
    return bool(NPI_PATTERN.match(value))


def is_email(value: str) -> bool:
    """Check if value matches email pattern."""
    return bool(EMAIL_PATTERN.match(value))


def is_phone(value: str) -> bool:
    """Check if value matches US phone number pattern."""
    return bool(PHONE_PATTERN.match(value))


def is_practice_state(value: str) -> bool:
    """Check if value matches 2-letter US state abbreviation."""
    return bool(STATE_PATTERN.match(value))


def is_name(value: str) -> bool:
    """Check if value looks like a name (capitalized string with no special characters)."""
    if not value or len(value) < 2:
        return False
    # Check if it starts with capital letter and contains only letters, spaces, hyphens, apostrophes
    return bool(re.match(r"^[A-Z][a-zA-Z\s\-']{1,}$", value))


def is_specialty(value: str) -> bool:
    """Check if value looks like a medical specialty."""
    if not value or len(value) < 3:
        return False
    # Specialty should be alphabetic, can contain spaces, ampersands, hyphens
    return bool(SPECIALTY_PATTERN.match(value))


def is_boolean(value: str) -> bool:
    """Check if value represents a boolean (True/False, Yes/No, 1/0)."""
    normalized = value.lower()
    return normalized in BOOLEAN_TRUE_VALUES or normalized in BOOLEAN_FALSE_VALUES


def infer_column_type(column_name: str, sample_values: list[str]) -> str:
    """
    Infer the type of a column based on column name and sample data.
    
    Uses a 90% threshold for statistical accuracy.
    
    Args:
        column_name: The name of the column
        sample_values: List of sample values from the column (typically 5-10 rows)
    
    Returns:
        Inferred type string (e.g., 'npi', 'email', 'phone', 'boolean', 'string')
    """
    # Normalize the column name for matching
    normalized_name = column_name.lower()
    
    # Check header-name synonyms first (highest priority)
    for field_type, synonyms in FIELD_SYNONYMS.items():
        if normalized_name in synonyms:
            # Special case: boolean fields need validation
            if field_type == "boolean":
                bool_matches = sum(1 for v in sample_values if v and is_boolean(v))
                if bool_matches / len([v for v in sample_values if v]) >= 0.9:
                    return "boolean"
            else:
                return field_type
    
    # Filter out empty values for statistical analysis
    non_empty_values = [v for v in sample_values if v]
    if not non_empty_values:
        return "string"  # Default for empty columns
    
    # Calculate match percentages for each type
    type_matches = {
        "npi": sum(1 for v in non_empty_values if is_npi(v)),
        "email": sum(1 for v in non_empty_values if is_email(v)),
        "phone": sum(1 for v in non_empty_values if is_phone(v)),
        "practiceState": sum(1 for v in non_empty_values if is_practice_state(v)),
        "boolean": sum(1 for v in non_empty_values if is_boolean(v)),
        "firstName": sum(1 for v in non_empty_values if is_name(v)),
        "lastName": sum(1 for v in non_empty_values if is_name(v)),
        "specialty": sum(1 for v in non_empty_values if is_specialty(v)),
    }
    
    # Calculate percentages
    total_non_empty = len(non_empty_values)
    match_percentages = {
        dtype: (count / total_non_empty) for dtype, count in type_matches.items()
    }
    
    # Find the best match with 90% threshold
    best_type = None
    best_percentage = 0.0
    
    for dtype, percentage in match_percentages.items():
        if percentage >= 0.9 and percentage > best_percentage:
            best_type = dtype
            best_percentage = percentage
    
    # If a type matches >90%, return it
    if best_type:
        return best_type
    
    # Fallback: return the type with highest match percentage (if >50%)
    if match_percentages:
        best_type = max(match_percentages, key=match_percentages.get)
        if match_percentages[best_type] >= 0.5:
            return best_type
    
    # Default to string type
    return "string"


def infer_column_types(columns: list[str], sample_data: list[dict]) -> dict[str, str]:
    """
    Infer types for all columns in a dataset based on header names and sample data.
    
    This is the main entry point for the heuristic type detection engine.
    
    Args:
        columns: List of column names from the CSV
        sample_data: List of dictionaries containing sample rows (typically 5-10 rows)
    
    Returns:
        Dictionary mapping column names to inferred types
        Example: {"npi": "npi", "email": "email", "opted_in": "boolean", ...}
    """
    inferred_schema = {}
    
    for column in columns:
        # Extract sample values for this column
        sample_values = [
            normalize_value(row.get(column)) for row in sample_data if column in row
        ]
        
        # Infer the type based on name and sample data
        inferred_type = infer_column_type(column, sample_values)
        inferred_schema[column] = inferred_type
    
    return inferred_schema
