import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Briefcase, Award, Send, MessageSquare, ArrowLeft, X, List, AlertTriangle } from 'lucide-react';
import './index.css'

interface ParsedResume {
    name?: string;
    skills: {
        skills?: string[];
    };
    experience: {
        title: string;
        company: string;
        duration: string;
        achievements: string[];
    }[];
    projects: {
        title: string;
        description: string;
        link: string;
    }[];
}

interface InterviewMessage {
    type: 'interviewer' | 'candidate';
    content: string;
    feedback?: string;
    score?: number;
    isTyping?: boolean;
}

interface LocationState {
    initialMessage?: string;
    interviewStatus?: 'not_started' | 'in_progress' | 'completed';
}

function InterviewPage() {
    const { interviewId } = useParams<{ interviewId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const state = location.state as LocationState;

    const [parsedData, setParsedData] = useState<ParsedResume | null>(null);
    const [interviewStatus, setInterviewStatus] = useState<'not_started' | 'in_progress' | 'completed'>(
        state?.interviewStatus || 'in_progress'
    );
    const [interviewMessages, setInterviewMessages] = useState<InterviewMessage[]>([]);
    const [userResponse, setUserResponse] = useState('');
    const [interviewLoading, setInterviewLoading] = useState(false);
    const [interviewScore, setInterviewScore] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [questionsAsked, setQuestionsAsked] = useState(0);
    const [lowScoreStreak, setLowScoreStreak] = useState(0);

    useEffect(() => {
        try {
            const savedResumeData = localStorage.getItem('resumeData');
            if (savedResumeData) {
                setParsedData(JSON.parse(savedResumeData));
            } else {
                setError('Resume data not found. Please return to the home page.');
            }

            if (state?.initialMessage) {
                setInterviewMessages([
                    {
                        type: 'interviewer',
                        content: state.initialMessage,
                        isTyping: false
                    }
                ]);
                setQuestionsAsked(1);
            }
        } catch (error) {
            console.error('Error loading resume data:', error);
            setError('Error loading resume data. Please return to the home page.');
        }
    }, [state]);

    const sendResponse = async () => {
        if (!parsedData || !interviewId || !userResponse.trim()) return;

        setInterviewLoading(true);

        // Add user message and typing indicator
        const updatedMessages = [
            ...interviewMessages,
            {
                type: 'candidate',
                content: userResponse,
                isTyping: false
            },
            {
                type: 'interviewer',
                content: '',
                isTyping: true
            }
        ];
        setInterviewMessages(updatedMessages);
        setUserResponse('');

        try {
            // Simulate human response time (1-3 seconds)
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

            const response = await fetch('http://localhost:5000/continue-interview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    resumeData: parsedData,
                    interviewId: interviewId,
                    userResponse: userResponse,
                    conversationHistory: interviewMessages.filter(m => !m.isTyping)
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to continue interview');
            }

            setInterviewStatus(data.interviewStatus);
            setQuestionsAsked(prev => prev + 1);
            setLowScoreStreak(data.lowScoreStreak || 0);

            // Replace typing indicator with actual response
            setInterviewMessages(prev => [
                ...prev.slice(0, -1),
                {
                    type: 'interviewer',
                    content: data.message,
                    feedback: data.feedback,
                    score: data.score,
                    isTyping: false
                }
            ]);

            if (data.score) {
                setInterviewScore(prev => prev ? (prev + data.score) / 2 : data.score);
            }

        } catch (error) {
            console.error('Error in interview response:', error);
            setError(error instanceof Error ? error.message : 'Failed to get interview response. Please try again.');
        } finally {
            setInterviewLoading(false);
        }
    };

    const endInterview = async () => {
        setInterviewLoading(true);
        try {
            // Add typing indicator
            setInterviewMessages(prev => [
                ...prev,
                {
                    type: 'interviewer',
                    content: '',
                    isTyping: true
                }
            ]);

            // Simulate human response time
            await new Promise(resolve => setTimeout(resolve, 1500));

            setInterviewMessages(prev => [
                ...prev.slice(0, -1),
                {
                    type: 'interviewer',
                    content: "Thank you for your time today. It's been great learning more about your experience. We'll wrap up here - I appreciate you taking the time to speak with me. Best of luck with everything!",
                    feedback: "Interview completed",
                    score: interviewScore || undefined,
                    isTyping: false
                }
            ]);
            setInterviewStatus('completed');
        } catch (error) {
            console.error('Error ending interview:', error);
            setError('Failed to end interview. Please try again.');
        } finally {
            setInterviewLoading(false);
        }
    };

    const resetInterview = () => {
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-4xl mx-auto py-12 px-4">
                <div className="mb-8 flex justify-between items-center">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center text-gray-700 hover:text-gray-900"
                    >
                        <ArrowLeft className="w-5 h-5 mr-1" />
                        Back to Home
                    </button>
                    <div className="flex items-center gap-4">
                        {interviewStatus === 'in_progress' && (
                            <div className="flex items-center gap-2">
                                <div className="flex items-center bg-gray-100 px-3 py-1 rounded-full text-sm">
                                    <List className="w-4 h-4 mr-1 text-gray-600" />
                                    <span>Question {questionsAsked}/25</span>
                                </div>
                                {lowScoreStreak >= 2 && (
                                    <div className="flex items-center bg-yellow-50 px-3 py-1 rounded-full text-sm text-yellow-700">
                                        <AlertTriangle className="w-4 h-4 mr-1" />
                                        <span>Low score streak: {lowScoreStreak}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {interviewStatus === 'in_progress' && (
                            <button
                                onClick={endInterview}
                                disabled={interviewLoading}
                                className="flex items-center px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-md text-sm font-medium"
                            >
                                <X className="w-4 h-4 mr-1" />
                                End Interview
                            </button>
                        )}
                    </div>
                </div>

                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        {parsedData?.name ? `${parsedData.name}'s Interview` : 'Virtual Interview'}
                    </h1>
                    <p className="text-gray-600">Practice your interview skills in a natural conversation</p>
                </div>

                {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-red-700">{error}</p>
                        <button
                            onClick={() => navigate('/')}
                            className="mt-2 px-4 py-2 bg-red-600 text-white rounded-md"
                        >
                            Return to Home
                        </button>
                    </div>
                )}

                <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-12">
                    <div className="border-b border-gray-200 p-4 flex justify-between items-center">
                        <div className="flex items-center">
                            <Briefcase className="w-5 h-5 text-green-500 mr-2" />
                            <h2 className="text-xl font-semibold text-gray-900">Interview Conversation</h2>
                        </div>

                        {interviewScore !== null && (
                            <div className="flex items-center bg-blue-50 px-3 py-1 rounded-full">
                                <Award className="w-4 h-4 text-blue-500 mr-1" />
                                <span className="text-sm font-medium text-blue-700">Score: {interviewScore.toFixed(1)}/10</span>
                            </div>
                        )}
                    </div>

                    <div className="p-4 max-h-96 overflow-y-auto">
                        <div className="space-y-4">
                            {interviewMessages.map((message, index) => (
                                <div
                                    key={index}
                                    className={`flex ${message.type === 'interviewer' ? 'justify-start' : 'justify-end'}`}
                                >
                                    <div
                                        className={`max-w-3/4 rounded-lg p-4 transition-all duration-300 ${
                                            message.type === 'interviewer'
                                                ? 'bg-gray-100 text-gray-800'
                                                : 'bg-blue-600 text-white'
                                        } ${
                                            message.isTyping ? 'opacity-75' : 'opacity-100'
                                        }`}
                                    >
                                        {message.isTyping ? (
                                            <div className="flex space-x-1 items-center">
                                                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"></div>
                                                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{animationDelay: '0.2s'}}></div>
                                                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{animationDelay: '0.4s'}}></div>
                                            </div>
                                        ) : (
                                            <>
                                                <p className="whitespace-pre-wrap">{message.content}</p>
                                                {message.feedback && message.type === 'interviewer' && index > 0 && (
                                                    <div className="mt-2 p-2 bg-white bg-opacity-20 rounded">
                                                        <p className="text-xs font-semibold">Feedback:</p>
                                                        <p className="text-xs">{message.feedback}</p>
                                                    </div>
                                                )}
                                                {message.score !== undefined && message.type === 'interviewer' && index > 0 && (
                                                    <div className="mt-2 flex items-center">
                                                        <Award className={`w-4 h-4 ${message.type === 'interviewer' ? 'text-blue-500' : 'text-white'} mr-1`} />
                                                        <span className="text-xs font-medium">Score: {message.score}/10</span>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {interviewStatus === 'in_progress' ? (
                        <div className="border-t border-gray-200 p-4">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={userResponse}
                                    onChange={(e) => setUserResponse(e.target.value)}
                                    disabled={interviewLoading}
                                    placeholder="Type your response here..."
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter' && !interviewLoading) {
                                            sendResponse();
                                        }
                                    }}
                                />
                                <button
                                    onClick={sendResponse}
                                    disabled={interviewLoading || !userResponse.trim()}
                                    className={`px-4 py-2 rounded-md text-white ${
                                        interviewLoading || !userResponse.trim()
                                            ? 'bg-gray-400'
                                            : 'bg-blue-600 hover:bg-blue-700'
                                    }`}
                                >
                                    <Send className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ) : interviewStatus === 'completed' && (
                        <div className="border-t border-gray-200 p-4 bg-green-50">
                            <div className="text-center">
                                <h3 className="text-lg font-medium text-green-800">Interview Completed</h3>
                                <p className="text-green-700">Your conversation score: {interviewScore?.toFixed(1) || 'N/A'}/10</p>
                                {lowScoreStreak >= 3 && (
                                    <p className="text-yellow-700 mt-2">The conversation concluded early to focus on key areas</p>
                                )}
                                <div className="mt-4 flex justify-center space-x-4">
                                    <button
                                        onClick={resetInterview}
                                        className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md"
                                    >
                                        Return Home
                                    </button>
                                    <button
                                        onClick={() => navigate('/')}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
                                    >
                                        New Interview
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default InterviewPage;