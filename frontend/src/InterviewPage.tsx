import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Briefcase, Award, ArrowLeft, X, List, AlertTriangle, Mic, Volume2, VolumeX } from 'lucide-react';
import './index.css';

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

interface VoiceControls {
    isListening: boolean;
    isSpeaking: boolean;
    isAudioEnabled: boolean;
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
    const [voiceControls, setVoiceControls] = useState<VoiceControls>({
        isListening: false,
        isSpeaking: false,
        isAudioEnabled: true
    });
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [interimTranscript, setInterimTranscript] = useState('');

    const speechRecognition = useRef<any>(null);
    const silenceTimer = useRef<NodeJS.Timeout | null>(null);
    const speechSynthesis = useRef<any>(null);

    useEffect(() => {
        // Initialize speech recognition
        const initSpeechRecognition = () => {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = 'en-US';
                
                recognition.onresult = (event: any) => {
                    let finalTranscript = '';
                    let interimTranscript = '';
                    
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        const transcript = event.results[i][0].transcript;
                        if (event.results[i].isFinal) {
                            finalTranscript += transcript;
                        } else {
                            interimTranscript += transcript;
                        }
                    }
                    
                    if (finalTranscript) {
                        // Clear any existing silence timer
                        if (silenceTimer.current) {
                            clearTimeout(silenceTimer.current);
                            silenceTimer.current = null;
                        }
                        
                        setUserResponse(prev => prev + ' ' + finalTranscript);
                        setInterimTranscript('');
                        setIsSpeaking(false);
                        
                        // Auto-submit if we have a final transcript
                        if (!interviewLoading) {
                            sendResponse();
                        }
                    } else if (interimTranscript) {
                        setInterimTranscript(interimTranscript);
                        setIsSpeaking(true);
                        
                        // Reset the silence timer
                        if (silenceTimer.current) {
                            clearTimeout(silenceTimer.current);
                        }
                        silenceTimer.current = setTimeout(() => {
                            if (userResponse.trim() || interimTranscript.trim()) {
                                const fullResponse = userResponse + ' ' + interimTranscript;
                                setUserResponse(fullResponse.trim());
                                setInterimTranscript('');
                                setIsSpeaking(false);
                                if (!interviewLoading) {
                                    sendResponse();
                                }
                            }
                        }, 2000); // 2 seconds of silence
                    }
                };
                
                recognition.onerror = (event: any) => {
                    console.error('Speech recognition error', event.error);
                    setError('Speech recognition error. Please try again.');
                    setVoiceControls(prev => ({ ...prev, isListening: false }));
                };
                
                recognition.onend = () => {
                    if (voiceControls.isListening) {
                        recognition.start();
                    }
                };
                
                speechRecognition.current = recognition;
            } else {
                setError('Speech recognition not supported in this browser');
            }
        };

        // Initialize speech synthesis
        if ('speechSynthesis' in window) {
            speechSynthesis.current = window.speechSynthesis;
        } else {
            setError('Speech synthesis not supported in this browser');
        }

        // Load resume data
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

        initSpeechRecognition();

        return () => {
            if (silenceTimer.current) {
                clearTimeout(silenceTimer.current);
            }
            if (speechRecognition.current) {
                speechRecognition.current.stop();
            }
        };
    }, []);

    useEffect(() => {
        if (!voiceControls.isAudioEnabled || !speechSynthesis.current) return;

        const lastMessage = interviewMessages[interviewMessages.length - 1];
        if (lastMessage?.type === 'interviewer' && !lastMessage.isTyping) {
            speakMessage(lastMessage.content);
        }
    }, [interviewMessages, voiceControls.isAudioEnabled]);

    const speakMessage = (text: string) => {
        if (!speechSynthesis.current || !voiceControls.isAudioEnabled) return;

        setVoiceControls(prev => ({ ...prev, isSpeaking: true }));
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.volume = 1;
        
        utterance.onend = () => {
            setVoiceControls(prev => ({ ...prev, isSpeaking: false }));
        };
        
        speechSynthesis.current.speak(utterance);
    };

    const toggleListening = () => {
        if (!speechRecognition.current) return;

        if (voiceControls.isListening) {
            speechRecognition.current.stop();
            setVoiceControls(prev => ({ ...prev, isListening: false }));
            setIsSpeaking(false);
            
            // If we have any interim transcript, submit it
            if (interimTranscript.trim() || userResponse.trim()) {
                const fullResponse = userResponse + ' ' + interimTranscript;
                setUserResponse(fullResponse.trim());
                setInterimTranscript('');
                if (!interviewLoading) {
                    sendResponse();
                }
            }
        } else {
            setUserResponse('');
            setInterimTranscript('');
            speechRecognition.current.start();
            setVoiceControls(prev => ({ ...prev, isListening: true }));
        }
    };

    const toggleAudio = () => {
        if (voiceControls.isSpeaking) {
            speechSynthesis.current.cancel();
        }
        setVoiceControls(prev => ({ ...prev, isAudioEnabled: !prev.isAudioEnabled }));
    };

    const sendResponse = async () => {
        if (!parsedData || !interviewId || !userResponse.trim()) return;

        setInterviewLoading(true);

        // Add user message
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
        setInterimTranscript('');

        try {
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
            // Stop listening if we were
            if (voiceControls.isListening) {
                speechRecognition.current.stop();
                setVoiceControls(prev => ({ ...prev, isListening: false }));
                setIsSpeaking(false);
            }

            // Add typing indicator
            setInterviewMessages(prev => [
                ...prev,
                {
                    type: 'interviewer',
                    content: '',
                    isTyping: true
                }
            ]);

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
                        <div className="flex items-center gap-4">
                            <button
                                onClick={toggleAudio}
                                disabled={interviewLoading}
                                className={`p-2 rounded-full ${voiceControls.isAudioEnabled ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}
                                title={voiceControls.isAudioEnabled ? 'Mute voice' : 'Unmute voice'}
                            >
                                {voiceControls.isAudioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                            </button>
                            
                            {interviewStatus === 'in_progress' && (
                                <button
                                    onClick={toggleListening}
                                    disabled={interviewLoading || voiceControls.isSpeaking}
                                    className={`p-2 rounded-full ${voiceControls.isListening ? (isSpeaking ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600') : 'bg-gray-100 text-gray-600'}`}
                                    title={voiceControls.isListening ? (isSpeaking ? 'Listening...' : 'Stop listening') : 'Answer by voice'}
                                >
                                    <Mic className="w-5 h-5" />
                                </button>
                            )}
                        </div>
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
                                <div className="relative flex-1">
                                    <div className="w-full px-4 py-2 border border-gray-300 rounded-md bg-gray-50 min-h-12">
                                        <p className="text-gray-700">
                                            {userResponse || interimTranscript ? (
                                                <>
                                                    {userResponse && <span>{userResponse}</span>}
                                                    {interimTranscript && (
                                                        <span className="text-gray-500">
                                                            {userResponse ? ' ' : ''}{interimTranscript}
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="text-gray-500">
                                                    {voiceControls.isListening 
                                                        ? (isSpeaking ? "Listening..." : "Speak your answer...") 
                                                        : "Click microphone to answer by voice"}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    {voiceControls.isListening && (
                                        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                                            <div className="flex space-x-1">
                                                <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-green-500' : 'bg-gray-400'} animate-bounce`}></div>
                                                <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-green-500' : 'bg-gray-400'} animate-bounce`} style={{animationDelay: '0.2s'}}></div>
                                                <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-green-500' : 'bg-gray-400'} animate-bounce`} style={{animationDelay: '0.4s'}}></div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={toggleListening}
                                    disabled={interviewLoading || voiceControls.isSpeaking}
                                    className={`p-2 rounded-full ${voiceControls.isListening ? (isSpeaking ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600') : 'bg-blue-100 text-blue-600'}`}
                                    title={voiceControls.isListening ? (isSpeaking ? 'Listening...' : 'Stop listening') : 'Answer by voice'}
                                >
                                    <Mic className="w-5 h-5" />
                                </button>
                            </div>
                            {voiceControls.isListening && (
                                <div className="mt-2 text-xs text-gray-500">
                                    {isSpeaking ? "Speak naturally - your answer will auto-submit when you pause" : "Waiting for your response..."}
                                </div>
                            )}
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