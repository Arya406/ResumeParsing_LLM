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
import uuid
from typing import Dict, List

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

# Interview state storage
interviews: Dict[str, Dict] = {}

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

@app.route('/parse-resume', methods=['POST'])
def parse_resume():
    try:
        if 'resume' not in request.files:
            return jsonify({"error": "No resume file provided"}), 400

        resume_file = request.files['resume']
        filename = resume_file.filename.lower()

        if filename.endswith('.pdf'):
            resume_text = extract_text_from_pdf(resume_file)
        elif filename.endswith('.docx'):
            resume_text = extract_text_from_docx(resume_file)
        else:
            return jsonify({"error": "Unsupported file type. Only PDF and DOCX are allowed."}), 400

        if not resume_text.strip():
            return jsonify({"error": "No text could be extracted from the uploaded resume."}), 400

        max_text_length = 20000
        if len(resume_text) > max_text_length:
            resume_text = resume_text[:max_text_length]

        prompt = f"""
Extract the following information from this resume text and return only the JSON object:
Keys: "name", "skills", "experience", and "projects".

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

        response = requests.post(GROQ_API_URL, headers=headers, json=data)
        response.raise_for_status()
        result = response.json()

        if "choices" in result and len(result["choices"]) > 0:
            content = result["choices"][0]["message"]["content"]
            cleaned = re.sub(r"^```(?:json)?|```$", "", content.strip(), flags=re.MULTILINE)
            cleaned = re.sub(r'^.*?\{', '{', cleaned, flags=re.DOTALL)
            
            try:
                parsed = json.loads(cleaned)
                return jsonify(parsed)
            except json.JSONDecodeError as e:
                logger.error(f"JSON decoding error: {e}")
                return jsonify({"error": "Failed to parse resume data."}), 500
        else:
            return jsonify({"error": "API did not return results."}), 500

    except Exception as e:
        logger.error(f"Error: {e}\n{traceback.format_exc()}")
        return jsonify({'error': 'An unexpected error occurred.'}), 500

@app.route('/start-interview', methods=['POST'])
def start_interview():
    try:
        data = request.json
        resume_data = data.get('resumeData')
        
        if not resume_data:
            return jsonify({"error": "No resume data provided"}), 400
        
        interview_id = str(uuid.uuid4())
        
        prompt = f"""
You are a professional interviewer conducting a conversation with {resume_data.get('name', 'the candidate')}.

Guidelines:
1. Start with a warm, personalized greeting
2. Begin with easy icebreaker questions
3. Ask follow-up questions based on responses
4. Show genuine interest in answers
5. Keep conversation flowing naturally
6. Provide constructive feedback conversationally
7. End naturally by thanking them

Example flow:
- "Hi [Name], how are you today?"
- "I see you worked at [Company]. What was that like?"
- "Interesting! Tell me more about [specific detail]"
- "Let's discuss your [skill]. How have you applied it?"

Resume Summary:
Name: {resume_data.get('name', 'Not provided')}
Skills: {resume_data.get('skills', {}).get('skills', [])[:10]}
Experience: {[exp.get('title', '') for exp in resume_data.get('experience', [])][:3]}

Start with a warm greeting and first question.
"""
        
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }

        data = {
            "model": "llama3-70b-8192",
            "messages": [
                {"role": "system", "content": "You are a professional but friendly interviewer conducting a natural conversation."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7
        }

        response = requests.post(GROQ_API_URL, headers=headers, json=data)
        response.raise_for_status()
        result = response.json()

        if "choices" in result and len(result["choices"]) > 0:
            content = result["choices"][0]["message"]["content"]
            
            interviews[interview_id] = {
                "resume_data": resume_data,
                "conversation_history": [
                    {"role": "assistant", "content": content}
                ],
                "status": "in_progress",
                "current_score": None,
                "questions_asked": 1,
                "low_score_streak": 0
            }
            
            return jsonify({
                "interviewId": interview_id,
                "interviewStatus": "in_progress",
                "message": content,
                "feedback": "Let's begin our conversation!",
                "score": None
            })
        else:
            return jsonify({"error": "Failed to start interview"}), 500

    except Exception as e:
        logger.error(f"Error: {e}\n{traceback.format_exc()}")
        return jsonify({'error': 'Failed to start interview'}), 500

@app.route('/continue-interview', methods=['POST'])
def continue_interview():
    try:
        data = request.json
        interview_id = data.get('interviewId')
        user_response = data.get('userResponse')
        resume_data = data.get('resumeData')
        conversation_history = data.get('conversationHistory', [])
        
        if not interview_id or not user_response:
            return jsonify({"error": "Missing interview ID or response"}), 400
            
        interview = interviews.get(interview_id)
        if not interview:
            return jsonify({"error": "Invalid interview ID"}), 404
            
        messages = [
            {"role": "system", "content": f"""
You're having a natural conversation with {resume_data.get('name', 'the candidate')}.

Rules:
1. Respond like a human - show empathy and interest
2. Build on previous answers naturally
3. Ask thoughtful follow-up questions
4. Provide feedback conversationally
5. Maintain natural flow - don't just fire questions
6. When appropriate, share relevant insights
7. End naturally when time feels right
8. Don't behave like a AI

Current conversation:
{conversation_history}

Candidate's last response:
{user_response}

Respond naturally as a human interviewer would.
"""}
        ]
        
        for msg in conversation_history:
            if msg['type'] == 'interviewer':
                messages.append({"role": "assistant", "content": msg['content']})
            else:
                messages.append({"role": "user", "content": msg['content']})
        
        messages.append({"role": "user", "content": user_response})
        
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }

        data = {
            "model": "llama3-70b-8192",
            "messages": messages,
            "temperature": 0.7
        }

        response = requests.post(GROQ_API_URL, headers=headers, json=data)
        response.raise_for_status()
        result = response.json()

        if "choices" in result and len(result["choices"]) > 0:
            content = result["choices"][0]["message"]["content"]
            
            score_match = re.search(r'Score:\s*(\d+)/10', content)
            score = int(score_match.group(1)) if score_match else None
            
            if score and score < 5:
                interview['low_score_streak'] += 1
            else:
                interview['low_score_streak'] = 0
            
            interview['conversation_history'].append({"role": "assistant", "content": content})
            interview['questions_asked'] += 1
            
            termination_reason = None
            if interview['questions_asked'] >= 25:
                interview['status'] = 'completed'
                termination_reason = "question_limit"
            elif interview['low_score_streak'] >= 3:
                interview['status'] = 'completed'
                termination_reason = "low_score_streak"
            
            if interview['status'] == 'completed':
                if not any(x in content.lower() for x in ['conclude', 'final', 'end']):
                    if termination_reason == "low_score_streak":
                        content += "\n\nI appreciate your time today. We'll wrap up here - thank you for the conversation!"
                    else:
                        content += "\n\nThank you for your time! This has been a great conversation."
            
            return jsonify({
                "interviewStatus": interview['status'],
                "message": content,
                "feedback": "Well done!" if score and score >= 7 else "Let's explore this further",
                "score": score,
                "lowScoreStreak": interview['low_score_streak']
            })
        else:
            return jsonify({"error": "Failed to continue interview"}), 500

    except Exception as e:
        logger.error(f"Error: {e}\n{traceback.format_exc()}")
        return jsonify({'error': 'Failed to continue interview'}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "version": "1.0.0"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)