/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Upload, 
  FileAudio, 
  Loader2, 
  Copy, 
  Check, 
  X, 
  Mic,
  Volume2,
  FileText,
  Square,
  Play,
  Pause,
  Trash2,
  Youtube,
  Link as LinkIcon,
  Sparkles,
  LayoutList
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [activeTab, setActiveTab] = useState<'upload' | 'youtube'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [transcription, setTranscription] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [viewMode, setViewMode] = useState<'transcription' | 'summary'>('transcription');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        const recordedFile = new File([audioBlob], `rekaman-${Date.now()}.wav`, { type: 'audio/wav' });
        setFile(recordedFile);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      setTranscription('');
      setError(null);
      setAudioUrl(null);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Gagal mengakses mikrofon. Pastikan izin telah diberikan.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type.startsWith('audio/') || selectedFile.name.endsWith('.mp3') || selectedFile.name.endsWith('.wav') || selectedFile.name.endsWith('.m4a')) {
        setFile(selectedFile);
        setError(null);
        setTranscription('');
        setAudioUrl(null);
      } else {
        setError('Harap unggah file audio yang valid (MP3, WAV, M4A, dll.)');
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      if (droppedFile.type.startsWith('audio/') || droppedFile.name.endsWith('.mp3') || droppedFile.name.endsWith('.wav') || droppedFile.name.endsWith('.m4a')) {
        setFile(droppedFile);
        setError(null);
        setTranscription('');
        setAudioUrl(null);
      } else {
        setError('Harap unggah file audio yang valid.');
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const transcribeAudio = async () => {
    if (!file) return;
    setIsTranscribing(true);
    setError(null);
    setSummary('');
    setViewMode('transcription');
    try {
      const base64Data = await fileToBase64(file);
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: file.type || 'audio/mpeg',
                  data: base64Data,
                },
              },
              {
                text: "Harap transkripsikan file audio ini dengan akurat. Jika audio dalam bahasa selain bahasa Inggris, transkripsikan dalam bahasa aslinya. Berikan hanya teks transkripsi tanpa komentar tambahan.",
              },
            ],
          },
        ],
      });
      const text = response.text;
      if (text) {
        setTranscription(text);
      } else {
        throw new Error('Tidak ada transkripsi yang dihasilkan.');
      }
    } catch (err: any) {
      console.error('Transcription error:', err);
      setError(err.message || 'Gagal mentranskripsi audio. Silakan coba lagi.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const getYouTubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const transcribeYouTube = async () => {
    if (!youtubeUrl) return;
    if (!youtubeUrl.includes('youtube.com') && !youtubeUrl.includes('youtu.be')) {
      setError('Harap masukkan URL YouTube yang valid.');
      return;
    }
    setIsTranscribing(true);
    setError(null);
    setSummary('');
    setViewMode('transcription');
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Harap transkripsikan video YouTube ini dengan akurat: ${youtubeUrl}. Jika video dalam bahasa selain bahasa Inggris, transkripsikan dalam bahasa aslinya. Berikan hanya teks transkripsi tanpa komentar tambahan.`,
        config: {
          tools: [{ urlContext: {} }]
        },
      });
      const text = response.text;
      if (text) {
        setTranscription(text);
      } else {
        throw new Error('Tidak ada transkripsi yang dihasilkan.');
      }
    } catch (err: any) {
      console.error('YouTube transcription error:', err);
      setError(err.message || 'Gagal mentranskripsi video YouTube. Pastikan video tersedia dan publik.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const summarizeTranscription = async () => {
    if (!transcription) return;
    setIsSummarizing(true);
    setError(null);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Harap buat rangkuman singkat dan padat dari transkripsi berikut dalam bahasa Indonesia. Gunakan poin-poin jika perlu. Transkripsi: ${transcription}`,
      });
      const text = response.text;
      if (text) {
        setSummary(text);
        setViewMode('summary');
      } else {
        throw new Error('Gagal membuat rangkuman.');
      }
    } catch (err: any) {
      console.error('Summarization error:', err);
      setError(err.message || 'Gagal membuat rangkuman. Silakan coba lagi.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const copyToClipboard = () => {
    const textToCopy = viewMode === 'transcription' ? transcription : summary;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setFile(null);
    setYoutubeUrl('');
    setTranscription('');
    setSummary('');
    setViewMode('transcription');
    setError(null);
    setAudioUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#1A1A1A] font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="max-w-4xl mx-auto pt-12 pb-8 px-6">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-2"
        >
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <Mic size={22} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Transkripsi Audio & Video</h1>
        </motion.div>
        <p className="text-stone-500 max-w-lg">
          Ubah ucapan dari audio, rekaman, atau video YouTube menjadi teks secara instan.
        </p>
      </header>

      <main className="max-w-4xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Upload & Controls */}
          <div className="lg:col-span-5 space-y-6">
            {/* Tabs */}
            <div className="flex bg-white p-1 rounded-2xl border border-stone-200 shadow-sm">
              <button
                onClick={() => { setActiveTab('upload'); reset(); }}
                className={`flex-1 py-2 text-sm font-medium rounded-xl transition-all ${activeTab === 'upload' ? 'bg-emerald-600 text-white shadow-md' : 'text-stone-500 hover:bg-stone-50'}`}
              >
                File / Rekam
              </button>
              <button
                onClick={() => { setActiveTab('youtube'); reset(); }}
                className={`flex-1 py-2 text-sm font-medium rounded-xl transition-all ${activeTab === 'youtube' ? 'bg-emerald-600 text-white shadow-md' : 'text-stone-500 hover:bg-stone-50'}`}
              >
                YouTube
              </button>
            </div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl p-8 shadow-sm border border-stone-200"
            >
              {activeTab === 'upload' ? (
                <>
                  {!file && !isRecording ? (
                    <div className="space-y-6">
                      {/* Upload Area */}
                      <div 
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-stone-200 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all group"
                      >
                        <input 
                          type="file" 
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          accept="audio/*"
                          className="hidden"
                        />
                        <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                          <Upload className="text-stone-400 group-hover:text-emerald-500" size={28} />
                        </div>
                        <p className="text-sm font-medium text-stone-600 mb-1 text-center">Klik atau seret file audio</p>
                        <p className="text-xs text-stone-400">MP3, WAV, M4A hingga 20MB</p>
                      </div>

                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-stone-200"></span>
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-white px-2 text-stone-400">Atau</span>
                        </div>
                      </div>

                      {/* Record Button */}
                      <button
                        onClick={startRecording}
                        className="w-full flex items-center justify-center gap-3 py-4 px-6 bg-white border-2 border-emerald-600 text-emerald-600 rounded-2xl font-medium hover:bg-emerald-50 transition-all group"
                      >
                        <div className="w-3 h-3 bg-red-500 rounded-full group-hover:animate-pulse"></div>
                        Mulai Rekam Suara
                      </button>
                    </div>
                  ) : isRecording ? (
                    <div className="flex flex-col items-center justify-center p-8 space-y-6">
                      <div className="relative">
                        <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center">
                          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center animate-ping absolute opacity-20"></div>
                          <Mic className="text-red-500" size={40} />
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-3xl font-mono font-bold text-stone-800">{formatTime(recordingTime)}</p>
                        <p className="text-sm text-stone-400 mt-1">Sedang merekam...</p>
                      </div>
                      <button
                        onClick={stopRecording}
                        className="w-full flex items-center justify-center gap-2 py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-medium shadow-lg shadow-red-100 transition-all"
                      >
                        <Square size={20} fill="currentColor" />
                        Berhenti Merekam
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                            <FileAudio className="text-emerald-600" size={20} />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-sm font-medium truncate max-w-[150px]">{file?.name}</p>
                            <p className="text-xs text-stone-400">
                              {file ? (file.size / (1024 * 1024)).toFixed(2) : '0'} MB
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={reset}
                          className="p-2 hover:bg-stone-200 rounded-full transition-colors"
                        >
                          <Trash2 size={16} className="text-stone-500" />
                        </button>
                      </div>

                      {audioUrl && (
                        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
                          <audio src={audioUrl} controls className="w-full h-10" />
                        </div>
                      )}

                      <button
                        onClick={transcribeAudio}
                        disabled={isTranscribing}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white py-4 rounded-2xl font-medium shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2"
                      >
                        {isTranscribing ? (
                          <>
                            <Loader2 className="animate-spin" size={20} />
                            Mentranskripsi...
                          </>
                        ) : (
                          <>
                            <Volume2 size={20} />
                            Mulai Transkripsi
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-stone-600 flex items-center gap-2">
                      <Youtube size={18} className="text-red-600" />
                      URL Video YouTube
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <LinkIcon size={16} className="text-stone-400" />
                      </div>
                      <input
                        type="text"
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="block w-full pl-10 pr-3 py-3 border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  {getYouTubeId(youtubeUrl) && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="aspect-video rounded-2xl overflow-hidden border border-stone-200 bg-black"
                    >
                      <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${getYouTubeId(youtubeUrl)}`}
                        title="YouTube video player"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    </motion.div>
                  )}

                  <button
                    onClick={transcribeYouTube}
                    disabled={isTranscribing || !youtubeUrl}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white py-4 rounded-2xl font-medium shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2"
                  >
                    {isTranscribing ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        Menganalisis Video...
                      </>
                    ) : (
                      <>
                        <Youtube size={20} />
                        Transkripsi YouTube
                      </>
                    )}
                  </button>
                </div>
              )}

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-3 bg-red-50 text-red-600 text-xs rounded-xl border border-red-100"
                >
                  {error}
                </motion.div>
              )}
            </motion.div>

            <div className="bg-emerald-900 rounded-3xl p-8 text-white shadow-xl">
              <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                <FileText size={20} className="text-emerald-400" />
                Cara Kerja
              </h3>
              <ul className="space-y-4 text-emerald-100/70 text-sm">
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-emerald-800 flex items-center justify-center text-[10px] font-bold text-emerald-400 shrink-0">1</span>
                  Pilih metode: Unggah file, Rekam suara, atau tempel URL YouTube.
                </li>
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-emerald-800 flex items-center justify-center text-[10px] font-bold text-emerald-400 shrink-0">2</span>
                  Gemini AI menganalisis konten audio atau video tersebut.
                </li>
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-emerald-800 flex items-center justify-center text-[10px] font-bold text-emerald-400 shrink-0">3</span>
                  Dapatkan transkripsi teks yang bersih dan akurat dalam hitungan detik.
                </li>
              </ul>
            </div>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-7">
            <AnimatePresence mode="wait">
              {transcription ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-white rounded-3xl shadow-sm border border-stone-200 flex flex-col h-full min-h-[500px]"
                >
                  <div className="p-6 border-bottom border-stone-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <h2 className="font-medium text-stone-800">
                        {viewMode === 'transcription' ? 'Hasil Transkripsi' : 'Rangkuman AI'}
                      </h2>
                      {summary && (
                        <div className="flex bg-stone-100 p-1 rounded-lg">
                          <button
                            onClick={() => setViewMode('transcription')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'transcription' ? 'bg-white text-emerald-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                          >
                            <LayoutList size={14} className="inline mr-1" />
                            Transkripsi
                          </button>
                          <button
                            onClick={() => setViewMode('summary')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'summary' ? 'bg-white text-emerald-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                          >
                            <Sparkles size={14} className="inline mr-1" />
                            Rangkuman
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!summary && (
                        <button
                          onClick={summarizeTranscription}
                          disabled={isSummarizing}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 disabled:bg-stone-50 disabled:text-stone-400 rounded-xl text-sm font-medium transition-colors text-emerald-600"
                        >
                          {isSummarizing ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              Merangkum...
                            </>
                          ) : (
                            <>
                              <Sparkles size={16} />
                              Buat Rangkuman
                            </>
                          )}
                        </button>
                      )}
                      <button
                        onClick={copyToClipboard}
                        className="flex items-center gap-2 px-4 py-2 bg-stone-50 hover:bg-stone-100 rounded-xl text-sm font-medium transition-colors text-stone-600"
                      >
                        {copied ? (
                          <>
                            <Check size={16} className="text-emerald-600" />
                            Tersalin
                          </>
                        ) : (
                          <>
                            <Copy size={16} />
                            Salin {viewMode === 'transcription' ? 'Teks' : 'Rangkuman'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="p-8 flex-1 overflow-y-auto prose prose-stone max-w-none">
                    <p className="text-stone-700 leading-relaxed whitespace-pre-wrap">
                      {viewMode === 'transcription' ? transcription : summary}
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-stone-100/50 border-2 border-dashed border-stone-200 rounded-3xl flex flex-col items-center justify-center p-12 h-full min-h-[500px] text-center"
                >
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm mb-6">
                    <FileText className="text-stone-300" size={32} />
                  </div>
                  <h3 className="text-lg font-medium text-stone-400 mb-2">Belum ada transkripsi</h3>
                  <p className="text-stone-400 text-sm max-w-xs">
                    Pilih metode di sebelah kiri dan mulai transkripsi untuk melihat hasilnya di sini.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-6 py-12 border-t border-stone-200 flex flex-col md:flex-row items-center justify-between gap-4 text-stone-400 text-xs">
        <p>© 2026 AI Transkripsi Audio & Video. Didukung oleh Gemini 3 Flash.</p>
        <div className="flex gap-6">
          <a href="#" className="hover:text-stone-600">Privasi</a>
          <a href="#" className="hover:text-stone-600">Ketentuan</a>
          <a href="#" className="hover:text-stone-600">Bantuan</a>
        </div>
      </footer>
    </div>
  );
}
