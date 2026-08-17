"""
Comprehensive tests for healthcare heuristic column type detection (MA-19).

Tests verify that the engine identifies healthcare-specific fields like NPI,
state codes, emails, phone numbers, and HIPAA Has_Opted_In booleans with >90% accuracy.
"""
import pytest

from fastapi.testclient import TestClient
from heuristics import (
    infer_column_types,
    is_npi,
    is_email,
    is_phone,
    is_practice_state,
    is_boolean,
    is_name,
    is_specialty,
    normalize_value,
)
from main import app


client = TestClient(app)


class TestHeuristicPatternMatching:
    """Test individual pattern matching functions."""

    def test_npi_pattern_matching(self):
        """Test NPI (10-digit number) detection."""
        assert is_npi("1234567890") is True
        assert is_npi("9876543210") is True
        assert is_npi("0000000000") is True
        assert is_npi("123456789") is False  # Only 9 digits
        assert is_npi("12345678901") is False  # 11 digits
        assert is_npi("123456789a") is False  # Contains letter
        assert is_npi("") is False
        print("✓ NPI pattern matching: PASSED")

    def test_email_pattern_matching(self):
        """Test email detection."""
        assert is_email("john.doe@example.com") is True
        assert is_email("jane_smith@hospital.org") is True
        assert is_email("dr.johnson+tag@clinic.co.uk") is True
        assert is_email("invalid@") is False
        assert is_email("@example.com") is False
        assert is_email("no-at-sign.com") is False
        assert is_email("") is False
        print("✓ Email pattern matching: PASSED")

    def test_phone_pattern_matching(self):
        """Test US phone number detection."""
        assert is_phone("(555) 123-4567") is True
        assert is_phone("555-123-4567") is True
        assert is_phone("5551234567") is True
        assert is_phone("+1-555-123-4567") is True
        assert is_phone("555.123.4567") is True
        assert is_phone("123-456") is False  # Incomplete
        assert is_phone("invalid") is False
        assert is_phone("") is False
        print("✓ Phone pattern matching: PASSED")

    def test_state_pattern_matching(self):
        """Test US state abbreviation (2-letter code) detection."""
        assert is_practice_state("CA") is True
        assert is_practice_state("NY") is True
        assert is_practice_state("TX") is True
        assert is_practice_state("DC") is True
        assert is_practice_state("ca") is False  # Must be uppercase
        assert is_practice_state("CAL") is False  # 3 letters
        assert is_practice_state("C") is False  # 1 letter
        assert is_practice_state("12") is False  # Numbers
        assert is_practice_state("") is False
        print("✓ State pattern matching: PASSED")

    def test_boolean_pattern_matching(self):
        """Test boolean value detection (True/False, Yes/No, 1/0)."""
        # True variants
        assert is_boolean("true") is True
        assert is_boolean("True") is True
        assert is_boolean("TRUE") is True
        assert is_boolean("yes") is True
        assert is_boolean("Yes") is True
        assert is_boolean("1") is True
        assert is_boolean("y") is True
        assert is_boolean("opt-in") is True
        assert is_boolean("opted-in") is True
        
        # False variants
        assert is_boolean("false") is True
        assert is_boolean("False") is True
        assert is_boolean("no") is True
        assert is_boolean("No") is True
        assert is_boolean("0") is True
        assert is_boolean("n") is True
        assert is_boolean("opt-out") is True
        
        # Invalid
        assert is_boolean("maybe") is False
        assert is_boolean("2") is False
        assert is_boolean("") is False
        print("✓ Boolean pattern matching: PASSED")

    def test_name_pattern_matching(self):
        """Test name field detection (capitalized strings)."""
        assert is_name("John") is True
        assert is_name("Mary-Anne") is True
        assert is_name("O'Brien") is True
        assert is_name("Jean-Claude") is True
        assert is_name("JOHN") is True  # All caps names are valid
        assert is_name("john") is False  # Not capitalized
        assert is_name("J") is False  # Too short
        assert is_name("123") is False  # Numbers
        assert is_name("") is False
        print("✓ Name pattern matching: PASSED")

    def test_specialty_pattern_matching(self):
        """Test medical specialty detection."""
        assert is_specialty("Cardiology") is True
        assert is_specialty("Internal Medicine") is True
        assert is_specialty("OB/GYN") is True
        assert is_specialty("ENT & Head Surgery") is True
        assert is_specialty("Orthopedic Surgery") is True
        assert is_specialty("M") is False  # Too short
        assert is_specialty("123") is False  # Numbers
        assert is_specialty("") is False
        print("✓ Specialty pattern matching: PASSED")

    def test_normalize_value(self):
        """Test value normalization."""
        assert normalize_value("  test  ") == "test"
        assert normalize_value(None) == ""
        assert normalize_value("") == ""
        assert normalize_value(123) == "123"
        assert normalize_value(True) == "True"
        print("✓ Value normalization: PASSED")


class TestHeuristicTypeInference:
    """Test the main type inference logic."""

    def test_infer_npi_column(self):
        """Test NPI column inference from header name and data."""
        columns = ["npi"]
        sample_data = [
            {"npi": "1234567890"},
            {"npi": "9876543210"},
            {"npi": "1111111111"},
        ]
        schema = infer_column_types(columns, sample_data)
        assert schema["npi"] == "npi"
        print("✓ NPI column inference: PASSED")

    def test_infer_email_column(self):
        """Test email column inference."""
        columns = ["email_address"]
        sample_data = [
            {"email_address": "john@hospital.com"},
            {"email_address": "jane@clinic.org"},
            {"email_address": "dr.smith@medical.net"},
        ]
        schema = infer_column_types(columns, sample_data)
        assert schema["email_address"] == "email"
        print("✓ Email column inference: PASSED")

    def test_infer_phone_column(self):
        """Test phone column inference."""
        columns = ["phone_number"]
        sample_data = [
            {"phone_number": "(555) 123-4567"},
            {"phone_number": "555-234-5678"},
            {"phone_number": "5559876543"},
        ]
        schema = infer_column_types(columns, sample_data)
        assert schema["phone_number"] == "phone"
        print("✓ Phone column inference: PASSED")

    def test_infer_state_column(self):
        """Test practice state column inference."""
        columns = ["practice_state"]
        sample_data = [
            {"practice_state": "CA"},
            {"practice_state": "NY"},
            {"practice_state": "TX"},
        ]
        schema = infer_column_types(columns, sample_data)
        assert schema["practice_state"] == "practiceState"
        print("✓ Practice state column inference: PASSED")

    def test_infer_boolean_column_hipaa(self):
        """Test HIPAA opt-in boolean column inference."""
        columns = ["has_opted_in"]
        sample_data = [
            {"has_opted_in": "true"},
            {"has_opted_in": "yes"},
            {"has_opted_in": "1"},
            {"has_opted_in": "True"},
            {"has_opted_in": "opt-in"},
        ]
        schema = infer_column_types(columns, sample_data)
        assert schema["has_opted_in"] == "boolean"
        print("✓ Boolean HIPAA opt-in inference: PASSED")

    def test_infer_name_columns(self):
        """Test first and last name column inference."""
        columns = ["first_name", "last_name"]
        sample_data = [
            {"first_name": "John", "last_name": "Doe"},
            {"first_name": "Jane", "last_name": "Smith"},
            {"first_name": "Michael", "last_name": "Johnson"},
        ]
        schema = infer_column_types(columns, sample_data)
        assert schema["first_name"] == "firstName"
        assert schema["last_name"] == "lastName"
        print("✓ Name column inference: PASSED")

    def test_infer_specialty_column(self):
        """Test medical specialty column inference."""
        columns = ["specialty"]
        sample_data = [
            {"specialty": "Cardiology"},
            {"specialty": "Internal Medicine"},
            {"specialty": "OB/GYN"},
        ]
        schema = infer_column_types(columns, sample_data)
        assert schema["specialty"] == "specialty"
        print("✓ Specialty column inference: PASSED")

    def test_infer_mixed_healthcare_schema(self):
        """Test inference of complete healthcare schema with all field types."""
        columns = [
            "npi",
            "firstName",
            "lastName",
            "email",
            "phone",
            "practiceState",
            "specialty",
            "has_opted_in",
        ]
        sample_data = [
            {
                "npi": "1234567890",
                "firstName": "John",
                "lastName": "Doe",
                "email": "john@example.com",
                "phone": "(555) 123-4567",
                "practiceState": "CA",
                "specialty": "Cardiology",
                "has_opted_in": "true",
            },
            {
                "npi": "9876543210",
                "firstName": "Jane",
                "lastName": "Smith",
                "email": "jane@example.com",
                "phone": "555-234-5678",
                "practiceState": "NY",
                "specialty": "Internal Medicine",
                "has_opted_in": "yes",
            },
            {
                "npi": "1111111111",
                "firstName": "Michael",
                "lastName": "Johnson",
                "email": "michael@example.com",
                "phone": "5559876543",
                "practiceState": "TX",
                "specialty": "OB/GYN",
                "has_opted_in": "1",
            },
        ]
        schema = infer_column_types(columns, sample_data)
        
        # Verify all healthcare fields are detected correctly
        assert schema["npi"] == "npi"
        assert schema["firstName"] == "firstName"
        assert schema["lastName"] == "lastName"
        assert schema["email"] == "email"
        assert schema["phone"] == "phone"
        assert schema["practiceState"] == "practiceState"
        assert schema["specialty"] == "specialty"
        assert schema["has_opted_in"] == "boolean"
        
        print("✓ Mixed healthcare schema inference: PASSED")


class TestAccuracyThreshold:
    """Test that the engine meets the >90% accuracy threshold."""

    def test_90_percent_accuracy_npi(self):
        """Test NPI detection with 90%+ accuracy."""
        columns = ["npi"]
        # 9 valid NPIs out of 10 = 90% accuracy
        sample_data = [
            {"npi": "1234567890"},
            {"npi": "9876543210"},
            {"npi": "1111111111"},
            {"npi": "2222222222"},
            {"npi": "3333333333"},
            {"npi": "4444444444"},
            {"npi": "5555555555"},
            {"npi": "6666666666"},
            {"npi": "7777777777"},
            {"npi": "invalid"},  # 1 invalid
        ]
        schema = infer_column_types(columns, sample_data)
        assert schema["npi"] == "npi"
        print("✓ NPI 90% accuracy threshold: PASSED")

    def test_90_percent_accuracy_boolean(self):
        """Test boolean detection with 90%+ accuracy."""
        columns = ["opted_in"]
        # 9 valid booleans out of 10 = 90% accuracy
        sample_data = [
            {"opted_in": "true"},
            {"opted_in": "yes"},
            {"opted_in": "1"},
            {"opted_in": "True"},
            {"opted_in": "false"},
            {"opted_in": "no"},
            {"opted_in": "0"},
            {"opted_in": "opt-in"},
            {"opted_in": "opt-out"},
            {"opted_in": "maybe"},  # 1 invalid
        ]
        schema = infer_column_types(columns, sample_data)
        assert schema["opted_in"] == "boolean"
        print("✓ Boolean 90% accuracy threshold: PASSED")

    def test_accuracy_with_mixed_quality_data(self):
        """Test accuracy with real-world messy data."""
        columns = ["email", "phone", "state"]
        sample_data = [
            {"email": "john@example.com", "phone": "(555) 123-4567", "state": "CA"},
            {"email": "jane@clinic.org", "phone": "555-234-5678", "state": "NY"},
            {"email": "michael@hospital.net", "phone": "5559876543", "state": "TX"},
            {"email": "invalid-email", "phone": "not-a-phone", "state": "Invalid"},
            {"email": "dr.smith@medical.com", "phone": "+1-555-555-5555", "state": "FL"},
        ]
        schema = infer_column_types(columns, sample_data)
        
        # Email should still be detected (4 valid out of 5 = 80%, but it's the best match)
        assert schema["email"] == "email"
        # Phone should be detected (4 valid out of 5 = 80%)
        assert schema["phone"] == "phone"
        # State should be detected (4 valid out of 5 = 80%)
        assert schema["state"] == "practiceState"
        
        print("✓ Mixed quality data accuracy: PASSED")


class TestUploadEndpointIntegration:
    """Test integration with the upload endpoint."""

    def test_upload_endpoint_returns_inferred_schema(self):
        """Test that upload endpoint returns inferred_schema in response."""
        import io
        
        # Create a simple healthcare CSV
        csv_data = """npi,first_name,last_name,email,phone,practice_state,specialty,has_opted_in
1234567890,John,Doe,john@example.com,(555) 123-4567,CA,Cardiology,true
9876543210,Jane,Smith,jane@example.com,555-234-5678,NY,Internal Medicine,yes
"""
        
        # Upload the file
        response = client.post(
            "/api/companies/test-ma19-company/upload_file",
            files={"file": ("healthcare.csv", csv_data, "text/csv")},
        )
        
        # Verify response
        assert response.status_code == 201
        data = response.json()
        
        # Verify inferred_schema is present
        assert "inferred_schema" in data
        schema = data["inferred_schema"]
        
        # Verify all fields are correctly inferred
        assert schema["npi"] == "npi"
        assert schema["email"] == "email"
        assert schema["phone"] == "phone"
        assert schema["practice_state"] == "practiceState"
        assert schema["specialty"] == "specialty"
        assert schema["has_opted_in"] == "boolean"
        
        print("✓ Upload endpoint returns inferred_schema: PASSED")
        print(f"  Inferred schema: {schema}")


if __name__ == "__main__":
    # Run all pattern matching tests
    test_patterns = TestHeuristicPatternMatching()
    test_patterns.test_npi_pattern_matching()
    test_patterns.test_email_pattern_matching()
    test_patterns.test_phone_pattern_matching()
    test_patterns.test_state_pattern_matching()
    test_patterns.test_boolean_pattern_matching()
    test_patterns.test_name_pattern_matching()
    test_patterns.test_specialty_pattern_matching()
    test_patterns.test_normalize_value()
    
    # Run inference tests
    test_inference = TestHeuristicTypeInference()
    test_inference.test_infer_npi_column()
    test_inference.test_infer_email_column()
    test_inference.test_infer_phone_column()
    test_inference.test_infer_state_column()
    test_inference.test_infer_boolean_column_hipaa()
    test_inference.test_infer_name_columns()
    test_inference.test_infer_specialty_column()
    test_inference.test_infer_mixed_healthcare_schema()
    
    # Run accuracy threshold tests
    test_accuracy = TestAccuracyThreshold()
    test_accuracy.test_90_percent_accuracy_npi()
    test_accuracy.test_90_percent_accuracy_boolean()
    test_accuracy.test_accuracy_with_mixed_quality_data()
    
    # Run integration tests
    test_integration = TestUploadEndpointIntegration()
    test_integration.test_upload_endpoint_returns_inferred_schema()
    
    print("\n" + "="*70)
    print("✅ ALL MA-19 TESTS PASSED - Healthcare Heuristic Engine Verified")
    print("="*70)
