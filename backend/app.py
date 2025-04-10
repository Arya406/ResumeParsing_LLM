from flask import Flask, request, jsonify
from flask_cors import CORS
from PyPDF2 import PdfReader
from docx import Document
import os
import requests
import json
import re
import logging
import traceback
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Load Groq API key
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("Missing GROQ_API_KEY in .env")

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# Helper: Extract text from PDF
def extract_text_from_pdf(file_storage):
    try:
        reader = PdfReader(file_storage)
        text = "\n".join(page.extract_text() for page in reader.pages if page.extract_text())
        if not text.strip():
            raise ValueError("No text could be extracted from the PDF.")
        return text
    except Exception as e:
        logger.error(f"PDF parsing error: {e}")
        raise

# Helper: Extract text from DOCX
def extract_text_from_docx(file_storage):
    try:
        doc = Document(file_storage)
        text = "\n".join(para.text for para in doc.paragraphs if para.text.strip())
        if not text.strip():
            raise ValueError("No text could be extracted from the DOCX.")
        return text
    except Exception as e:
        logger.error(f"DOCX parsing error: {e}")
        raise

# Route: Parse Resume
@app.route('/parse-resume', methods=['POST'])
def parse_resume():
    try:
        logger.info("Received request to parse resume")

        if 'resume' not in request.files:
            return jsonify({"error": "No resume file provided"}), 400

        resume_file = request.files['resume']
        filename = resume_file.filename.lower()

        # Determine file type
        if filename.endswith('.pdf'):
            resume_text = extract_text_from_pdf(resume_file)
        elif filename.endswith('.docx'):
            resume_text = extract_text_from_docx(resume_file)
        else:
            return jsonify({"error": "Unsupported file type. Only PDF and DOCX are allowed."}), 400

        if not resume_text.strip():
            return jsonify({"error": "No text could be extracted from the uploaded resume."}), 400

        # Truncate if too long
        max_text_length = 20000
        if len(resume_text) > max_text_length:
            logger.warning("Resume too long, truncating text.")
            resume_text = resume_text[:max_text_length]

        # Construct prompt
        prompt = f"""
Extract the following information from this resume text and return only the JSON object (no explanation, no markdown code blocks).

Keys: "skills", "experience", and "projects".

Resume Text:
\"\"\"
{resume_text}
\"\"\"
"""

        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }

        data = {
            "model": "llama3-70b-8192",
            "messages": [
                {"role": "system", "content": "You are an expert at parsing resumes and returning structured JSON output."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3
        }

        # Call Groq API
        response = requests.post(GROQ_API_URL, headers=headers, json=data)
        response.raise_for_status()
        result = response.json()

        if "choices" in result and len(result["choices"]) > 0:
            content = result["choices"][0]["message"]["content"]
            logger.debug(f"Raw model response: {content}")

            # Clean and parse the model output
            cleaned = re.sub(r"^```(?:json)?|```$", "", content.strip(), flags=re.MULTILINE)
            cleaned = re.sub(r'^.*?\{', '{', cleaned, flags=re.DOTALL)  # Keep only the JSON part from first {
            
            try:
                parsed = json.loads(cleaned)
                return jsonify(parsed)
            except json.JSONDecodeError as e:
                logger.error(f"JSON decoding error after cleanup: {e}")
                return jsonify({"error": "Failed to parse resume data as JSON."}), 500
        else:
            logger.error("Invalid response from Groq API.")
            return jsonify({"error": "Groq API did not return any results."}), 500

    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Unhandled exception: {e}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'An unexpected error occurred while processing your resume.'}), 500

# Run the app
if __name__ == '__main__':
    app.run(debug=True)
