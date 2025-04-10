import React, { useState } from 'react';
import { Upload, FileText, Briefcase, Code, FolderGit2, AlertCircle, Info } from 'lucide-react';

interface ParsedResume {
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

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedResume | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setDebug(null);
    setParsedData(null);
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setDebug(null);
    setParsedData(null);

    const formData = new FormData();
    formData.append('resume', file);

    try {
      const response = await fetch('http://localhost:5000/parse-resume', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse resume');
      }

      // Check for missing keys
      const keys = Object.keys(data);
      if (!data.skills || !data.experience || !data.projects) {
        setDebug(`Missing expected fields in API response. Received keys: ${JSON.stringify(keys)}`);
      }

      // Update state with defaults for safety
      setParsedData({
        skills: {
          skills: Array.isArray(data.skills) ? data.skills : [],
          
        },
        experience: Array.isArray(data.experience)
          ? data.experience.map((exp: any) => ({
              ...exp,
              achievements: exp.description ? [exp.description] : []
            }))
          : [],
        projects: Array.isArray(data.projects)
          ? data.projects.map((proj: any) => ({
              ...proj,
              link: proj.link || ""
            }))
          : []
      });
      

    } catch (error) {
      console.error('Error parsing resume:', error);
      setError(error instanceof Error ? error.message : 'Failed to parse resume. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Resume Parser</h1>
          <p className="text-lg text-gray-600">Upload your resume and let AI extract the key information</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {debug && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start">
            <Info className="w-5 h-5 text-blue-500 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-blue-700 text-sm">{debug}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mb-12">
          <div className="max-w-xl mx-auto">
            <label className={`flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-white hover:bg-gray-50 transition-colors ${error ? 'border-red-300' : file ? 'border-green-500' : 'border-gray-300'}`}>
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className={`w-12 h-12 mb-4 ${error ? 'text-red-500' : file ? 'text-green-500' : 'text-gray-400'}`} />
                <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                <p className="text-xs text-gray-500">PDF or DOCX (MAX. 10MB)</p>
              </div>
              <input type="file" className="hidden" accept=".pdf,.docx" onChange={handleFileChange} />
            </label>

            {file && !error && (
              <div className="mt-4 flex items-center justify-between bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center">
                  <FileText className="w-5 h-5 text-gray-500 mr-2" />
                  <span className="text-sm text-gray-700">{file.name}</span>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`px-4 py-2 rounded-md text-white text-sm font-medium ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} transition-colors`}
                >
                  {loading ? 'Processing...' : 'Parse Resume'}
                </button>
              </div>
            )}
          </div>
        </form>

        {parsedData && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center mb-4">
                <Code className="w-5 h-5 text-blue-500 mr-2" />
                <h2 className="text-xl font-semibold text-gray-900">Skills</h2>
              </div>
              {Object.entries(parsedData.skills).length > 0 ? (
                Object.entries(parsedData.skills).map(([category, list]) => (
                  <div key={category} className="mb-3">
                    <h4 className="text-sm font-semibold text-gray-700 mb-1 capitalize">{category}</h4>
                    <div className="flex flex-wrap gap-2">
                      {list?.map((skill, i) => (
                        <span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No skills detected</p>
              )}
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center mb-4">
                <Briefcase className="w-5 h-5 text-green-500 mr-2" />
                <h2 className="text-xl font-semibold text-gray-900">Experience</h2>
              </div>
              {parsedData.experience.length > 0 ? (
                <div className="space-y-4">
                  {parsedData.experience.map((exp, index) => (
                    <div key={index} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                      <h3 className="font-medium text-gray-900">{exp.title}</h3>
                      <p className="text-sm text-gray-600">{exp.company} • {exp.duration}</p>
                      <ul className="list-disc list-inside text-sm text-gray-700 mt-2">
                        {exp.achievements.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No experience detected</p>
              )}
            </div>

            <div className="md:col-span-2 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center mb-4">
                <FolderGit2 className="w-5 h-5 text-purple-500 mr-2" />
                <h2 className="text-xl font-semibold text-gray-900">Projects</h2>
              </div>
              {parsedData.projects.length > 0 ? (
                <div className="grid gap-4">
                  {parsedData.projects.map((project, index) => (
                    <div key={index} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                      <h3 className="font-medium text-gray-900">{project.title}</h3>
                      <p className="mt-1 text-sm text-gray-700">{project.description}</p>
                      {project.link && (
                        <a href={project.link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-blue-600 hover:text-blue-800">
                          View Project →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No projects detected</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
