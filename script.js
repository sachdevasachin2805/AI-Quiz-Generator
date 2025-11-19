
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        'primary-blue': '#3b82f6',
                        'soft-blue': '#60a5fa',
                        'light-bg': '#f3f4f6',
                        'dark-bg': '#111827',
                        'dark-card': '#1f2937',
                    }
                }
            }
        }
    


        // Import necessary Firebase modules
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, doc, setDoc, getDoc, collection, query, where, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        // --- Global State and Constants ---
        const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";
        const API_KEY = "AIzaSyCLpnPaQ4gH3JIBXEbY_vMeoAfz_Hyy38g"; // Placeholder, key provided by runtime
        const MAX_RETRIES = 5;
        const QUIZ_COLLECTION_NAME = 'quizzes'; // Firestore collection name
        
        let db, auth;
        let userId = null;
        let isAuthReady = false;
        let isDarkMode = false;
        let currentQuiz = null; // Stores the active quiz data (questions, options, correctIndex)
        let timerInterval = null;
        let isAuthenticated = false; // New flag for manual login state

        // --- DOM Elements ---
        const appHeader = document.getElementById('appHeader');
        const initialLoading = document.getElementById('initialLoading');
        const authView = document.getElementById('authView');
        const startAppBtn = document.getElementById('startAppBtn');
        const authStatusMessage = document.getElementById('authStatusMessage');
        const generatorView = document.getElementById('generatorView');
        const loading = document.getElementById('loading');
        const loadingMessage = document.getElementById('loadingMessage');
        const quizDisplay = document.getElementById('quizDisplay');
        const generateQuizBtn = document.getElementById('generateQuizBtn');
        const refreshQuizBtn = document.getElementById('refreshQuizBtn');
        const checkAnswersBtn = document.getElementById('checkAnswersBtn');
        const downloadQuizBtn = document.getElementById('downloadQuizBtn');
        const downloadQuizPdfBtn = document.getElementById('downloadQuizPdfBtn'); // New PDF button
        const saveQuizBtn = document.getElementById('saveQuizBtn');
        const actionBar = document.getElementById('actionBar');
        const themeToggle = document.getElementById('themeToggle');
        const authStatus = document.getElementById('authStatus');
        const myQuizzesBtn = document.getElementById('myQuizzesBtn');
        const myQuizzesModal = document.getElementById('myQuizzesModal');
        const closeQuizzesModal = document.getElementById('closeQuizzesModal');
        const quizzesList = document.getElementById('quizzesList');
        const noQuizzesMessage = document.getElementById('noQuizzesMessage');
        const generateFromTextBtn = document.getElementById('generateFromTextBtn');
        const timerDisplay = document.getElementById('timerDisplay');
        const scoreDisplay = document.getElementById('scoreDisplay');
        const challengeModeToggle = document.getElementById('challengeModeToggle');
        const timerScoreContainer = document.getElementById('timerScoreContainer');
        const textInput = document.getElementById('textInput');
        const topicInput = document.getElementById('topicInput');
        const numQuestionsInput = document.getElementById('numQuestions'); // Changed to input
        
        const loginEmail = document.getElementById('loginEmail');
        const loginPassword = document.getElementById('loginPassword');


        // --- Utility Functions ---

        /**
         * Simulates a modern async fetch with exponential backoff for resilience.
         */
        const fetchWithRetry = async (url, options, retryCount = 0) => {
            try {
                const response = await fetch(url, options);
                if (response.status === 429 && retryCount < MAX_RETRIES) {
                    const delay = Math.pow(2, retryCount) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return fetchWithRetry(url, options, retryCount + 1);
                }
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response;
            } catch (error) {
                if (retryCount < MAX_RETRIES) {
                    const delay = Math.pow(2, retryCount) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return fetchWithRetry(url, options, retryCount + 1);
                }
                throw new Error("API request failed after multiple retries.");
            }
        };

        /**
         * Toggles the UI between dark and light mode.
         */
        const toggleTheme = () => {
            isDarkMode = !isDarkMode;
            const body = document.body;
            const sunIcon = document.getElementById('sunIcon');
            const moonIcon = document.getElementById('moonIcon');

            if (isDarkMode) {
                document.documentElement.classList.add('dark');
                body.classList.remove('bg-light-bg');
                body.classList.add('bg-gray-900');
                sunIcon.classList.remove('hidden');
                moonIcon.classList.add('hidden');
            } else {
                document.documentElement.classList.remove('dark');
                body.classList.remove('bg-gray-900');
                body.classList.add('bg-light-bg');
                sunIcon.classList.add('hidden');
                moonIcon.classList.remove('hidden');
            }
            localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        };

        /**
         * Starts or resets the quiz timer.
         */
        const startTimer = () => {
            if (!challengeModeToggle.checked) return;

            clearInterval(timerInterval);
            timerDisplay.classList.remove('hidden');
            const duration = 5 * 60; // 5 minutes in seconds
            let timeRemaining = duration;

            const updateTimer = () => {
                const minutes = String(Math.floor(timeRemaining / 60)).padStart(2, '0');
                const seconds = String(timeRemaining % 60).padStart(2, '0');
                timerDisplay.textContent = `${minutes}:${seconds}`;

                if (timeRemaining <= 60) {
                    timerDisplay.classList.add('text-yellow-400', 'animate-pulse');
                    timerDisplay.classList.remove('text-red-600', 'dark:text-red-400');
                } else {
                    timerDisplay.classList.remove('text-yellow-400', 'animate-pulse');
                    timerDisplay.classList.add('text-red-600', 'dark:text-red-400');
                }

                if (timeRemaining <= 0) {
                    clearInterval(timerInterval);
                    timerDisplay.textContent = 'TIME UP!';
                    checkAnswersBtn.click(); // Auto-check answers
                }
                timeRemaining--;
            };

            updateTimer();
            timerInterval = setInterval(updateTimer, 1000);
        };

        /**
         * Stops the quiz timer.
         */
        const stopTimer = () => {
            clearInterval(timerInterval);
            timerDisplay.classList.add('hidden');
            timerDisplay.classList.remove('animate-pulse');
        };

        // --- AI API Call Functions (Simplified/Redacted for brevity, as they were extensive and function correctly) ---

        /**
         * Generic function for calling the Gemini API for non-structured text.
         */
        const callGeminiForText = async (systemPrompt, userQuery) => {
            const payload = {
                contents: [{ parts: [{ text: userQuery }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                tools: [{ "google_search": {} }],
            };

            const response = await fetchWithRetry(`${API_URL}?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            return result.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't generate a response for that.";
        };

        /**
         * Handles the "Hint" button click.
         */
        const handleHint = async (questionText, hintBtn) => {
            hintBtn.disabled = true;
            hintBtn.textContent = 'Thinking...';

            const hintContainer = hintBtn.closest('.quiz-card').querySelector('.hint-container');

            const systemPrompt = "You are a concise quiz tutor. Provide a single-sentence, non-obvious hint to help the user answer the question without giving away the correct answer.";
            const userQuery = `Give me a hint for the question: "${questionText}"`;

            try {
                const hint = await callGeminiForText(systemPrompt, userQuery);
                hintContainer.innerHTML = `<p class="mt-2 text-sm text-yellow-600 dark:text-yellow-400 p-2 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg">${hint}</p>`;
                hintBtn.textContent = 'Hint (Used)';
            } catch (error) {
                console.error("Hint generation error:", error);
                hintBtn.textContent = 'Hint (Error)';
            }
        };

        /**
         * Handles the "Explanation" button click.
         */
        const handleExplanation = async (questionText, correctOption, explanationBtn, userChoice) => {
            explanationBtn.disabled = true;
            explanationBtn.textContent = 'Generating Explanation...';
            explanationBtn.classList.add('animate-pulse');

            const explanationContainer = explanationBtn.closest('.quiz-card').querySelector('.explanation-container');

            const systemPrompt = "You are an excellent teacher. Provide a concise, educational explanation of why the correct answer is correct, and specifically address why the user's selected wrong answer was incorrect (if a wrong answer was selected).";
            const userQuery = `Explain the answer for the question: "${questionText}". The correct answer is "${correctOption}". ${userChoice ? `The user incorrectly selected: "${userChoice}".` : ''}`;

            try {
                const explanation = await callGeminiForText(systemPrompt, userQuery);
                explanationContainer.innerHTML = `<p class="mt-2 text-sm text-gray-700 dark:text-gray-300 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border-l-4 border-primary-blue">${explanation}</p>`;
            } catch (error) {
                console.error("Explanation generation error:", error);
                explanationContainer.innerHTML = `<p class="mt-2 text-sm text-red-600">Error generating explanation.</p>`;
            } finally {
                explanationBtn.textContent = 'Explanation (Viewed)';
                explanationBtn.classList.remove('animate-pulse');
            }
        };

        // --- Quiz Generation and Rendering ---

        /**
         * Loads a quiz into the generator view.
         */
        const loadQuiz = (quiz, quizInfo = {}) => {
            currentQuiz = quiz;

            // Reset UI state
            stopTimer();
            scoreDisplay.classList.add('hidden');
            timerScoreContainer.classList.remove('hidden');

            // Apply Info to inputs if available
            topicInput.value = quizInfo.topic || 'Custom Quiz';
            numQuestionsInput.value = quiz.length;
            document.getElementById('difficulty').value = quizInfo.difficulty || 'Medium';

            renderQuiz(quiz);

            // Re-enable check answers button
            checkAnswersBtn.disabled = false;
            checkAnswersBtn.textContent = 'Check Answers';

            // Start timer if challenge mode is active
            if (challengeModeToggle.checked) {
                startTimer();
            }
        };

        /**
         * Renders the generated quiz data into the DOM.
         */
        const renderQuiz = (quiz) => {
            quizDisplay.innerHTML = '';
            actionBar.classList.remove('hidden');
            currentQuiz = quiz;

            quiz.forEach((q, index) => {
                const questionCard = document.createElement('div');
                questionCard.className = 'quiz-card bg-white dark:bg-dark-card shadow-lg rounded-xl p-5 md:p-6 transition-all duration-500 opacity-0 transform translate-y-4 hover:shadow-xl';
                questionCard.dataset.questionIndex = index;
                // Add fade-in animation delay
                questionCard.style.animation = `fadeIn 0.5s ease-out ${index * 0.1}s forwards`;

                // Store the correct index securely on the card data attribute
                questionCard.dataset.correctIndex = q.correctIndex;

                const optionsHtml = q.options.map((option, optIndex) => `
                    <div class="flex items-start space-x-3 p-3 rounded-lg cursor-pointer option-item transition-all duration-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                         data-option-index="${optIndex}">
                        <input type="radio" name="q${index}" id="q${index}opt${optIndex}" data-q-index="${index}" data-opt-index="${optIndex}"
                               class="mt-1 h-5 w-5 text-primary-blue border-gray-300 focus:ring-primary-blue dark:bg-gray-600 dark:border-gray-50 dark:checked:bg-primary-blue">
                        <label for="q${index}opt${optIndex}" class="flex-1 text-gray-800 dark:text-gray-200" data-field="option" data-index="${optIndex}" contenteditable="false">${option}</label>
                    </div>
                `).join('');

                questionCard.innerHTML = `
                    <div class="flex justify-between items-start mb-4">
                        <h3 class="text-lg font-bold text-gray-900 dark:text-gray-50 flex-1 mr-4">
                            ${index + 1}. <span contenteditable="false" data-field="question" class="question-text">${q.question}</span>
                        </h3>
                        <div class="flex space-x-2">
                            <button class="edit-btn text-sm font-medium text-primary-blue hover:text-soft-blue transition-colors duration-200"
                                    data-state="view">
                                Edit
                            </button>
                        </div>
                    </div>
                    <div class="options-container space-y-2 mb-2">
                        ${optionsHtml}
                    </div>

                    <div class="flex justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                        <button class="hint-btn text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed">Hint</button>
                        <button class="explanation-btn text-xs font-medium text-red-600 dark:text-red-400 hover:underline transition-colors duration-200 hidden disabled:opacity-50 disabled:cursor-not-allowed">Why was this wrong?</button>
                    </div>

                    <div class="hint-container mt-2"></div>
                    <div class="explanation-container mt-2"></div>
                `;
                quizDisplay.appendChild(questionCard);
            });

            // Add keyframes for fade-in animation
            if (!document.getElementById('fadeInStyle')) {
                const style = document.createElement('style');
                style.id = 'fadeInStyle';
                style.innerHTML = '@keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }';
                document.head.appendChild(style);
            }
        };

        /**
         * Handles the main quiz generation logic (Topic or Text based).
         */
        const handleGenerateQuiz = async (isRefresh = false, sourceText = null) => {
            const topic = topicInput.value.trim();
            const difficulty = document.getElementById('difficulty').value;
            const questionType = document.getElementById('questionType').value;
            let numQuestions = parseInt(numQuestionsInput.value);

            // --- REMOVED HARD LIMITS / ADDED VALIDATION ---
            if (numQuestions < 1 || isNaN(numQuestions)) {
                numQuestions = 5; // Default to 5 if input is invalid
                numQuestionsInput.value = 5;
            } else if (numQuestions > 30) {
                numQuestions = 30; // Practical upper limit for API stability
                numQuestionsInput.value = 30;
                console.warn("Question count capped at 30 for API stability.");
            }
            // --- END LIMITS/VALIDATION ---


            if (sourceText && sourceText.length < 100) {
                console.error('Please provide at least 100 characters of text to generate a quiz from.');
                quizDisplay.innerHTML = `<div class="p-8 text-center bg-red-50 dark:bg-red-900/50 rounded-xl mt-6"><p class="text-red-600 dark:text-red-400 font-semibold">Error: Please provide at least 100 characters of text to generate a quiz from.</p></div>`;
                return;
            }

            if (!sourceText && !topic) {
                console.error('Please enter a topic or paste text to begin.');
                quizDisplay.innerHTML = `<div class="p-8 text-center bg-red-50 dark:bg-red-900/50 rounded-xl mt-6"><p class="text-red-600 dark:text-red-400 font-semibold">Error: Please enter a topic or paste text to begin.</p></div>`;
                return;
            }

            // Reset UI State
            stopTimer();
            quizDisplay.innerHTML = `<p class="text-center text-gray-500 dark:text-gray-400 p-10 bg-white dark:bg-dark-card rounded-xl">Generating quiz...</p>`;
            actionBar.classList.add('hidden');
            scoreDisplay.classList.add('hidden');
            loadingMessage.textContent = sourceText ? `Analyzing text and generating ${numQuestions} questions...` : `${isRefresh ? 'Refreshing' : 'Generating'} ${difficulty} ${topic} quiz (${numQuestions} Qs)...`;
            loading.classList.remove('hidden');

            try {
                // Determine user query and system prompt
                const topicOrText = sourceText ? `the following provided text: "${sourceText.substring(0, 500)}..."` : `the topic: "${topic}"`;

                const systemPrompt = `You are a helpful and creative quiz generator. Based on ${topicOrText}, you must generate exactly ${numQuestions} multiple-choice questions with a difficulty of ${difficulty}. For each question, provide 4 distinct options and the 0-based index of the single correct answer. The output MUST be a single JSON object matching the provided schema, with NO introductory or concluding text.`;

                const userQuery = sourceText ? `Generate ${numQuestions} multiple-choice questions based ONLY on the provided text. Difficulty: ${difficulty}.` : `Generate ${numQuestions} multiple-choice questions on the topic: ${topic}. Difficulty: ${difficulty}.`;

                // JSON Schema for structured output
                const responseSchema = {
                    type: "OBJECT",
                    properties: {
                        quiz: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    "question": { "type": "STRING", "description": "The quiz question text." },
                                    "options": {
                                        "type": "ARRAY",
                                        "items": { "type": "STRING" },
                                        "description": "Exactly four answer options."
                                    },
                                    "correctIndex": { "type": "INTEGER", "description": "The 0-based index (0, 1, 2, or 3) of the correct option." }
                                },
                                "propertyOrdering": ["question", "options", "correctIndex"]
                            }
                        }
                    }
                };

                const payload = {
                    contents: [{ parts: [{ text: userQuery }] }],
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: responseSchema,
                    },
                };

                const response = await fetchWithRetry(`${API_URL}?key=${API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();
                const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

                if (!jsonText) {
                    throw new Error("Failed to parse LLM response. Content was missing or invalid.");
                }

                const parsedResult = JSON.parse(jsonText);
                const quizData = parsedResult.quiz;

                if (!quizData || quizData.length === 0) {
                    throw new Error("The AI generated an empty quiz. Try a different topic or text.");
                }

                loadQuiz(quizData, { topic: topic, difficulty: difficulty, type: questionType });

            } catch (error) {
                console.error("Quiz generation error:", error);
                const errorMessage = `<p class="text-red-600 dark:text-red-400 font-semibold">Error: Could not generate quiz. ${error.message}</p>`;
                quizDisplay.innerHTML = `<div class="p-8 text-center bg-red-50 dark:bg-red-900/50 rounded-xl mt-6">${errorMessage}</div>`;
                actionBar.classList.add('hidden'); // Hide action bar on error
            } finally {
                loading.classList.add('hidden');
            }
        };

        // --- PDF Generation Function ---

        /**
         * Converts the quiz display to a PDF using html2canvas and jsPDF.
         */
        const downloadQuizAsPdf = async () => {
            if (!currentQuiz) { 
                console.error('Download failed: Generate a quiz first!'); 
                authStatusMessage.innerHTML = `<span class="font-bold">Error!</span> Generate a quiz first to download PDF.`;
                authStatusMessage.classList.remove('bg-green-50', 'dark:bg-green-900/20', 'text-green-800', 'dark:text-green-300', 'border-green-400', 'bg-yellow-50', 'dark:bg-yellow-900/20', 'text-yellow-800', 'dark:text-yellow-300', 'border-yellow-400');
                authStatusMessage.classList.add('bg-red-50', 'dark:bg-red-900/20', 'text-red-800', 'dark:text-red-300', 'border-red-400');
                return; 
            }

            // Show temporary loading in the main message area
            authStatusMessage.innerHTML = `<span class="font-bold">Working...</span> Capturing and generating PDF. Please wait (10-30s).`;
            authStatusMessage.classList.remove('bg-red-50', 'dark:bg-red-900/20', 'text-red-800', 'dark:text-red-300', 'border-red-400', 'bg-green-50', 'dark:bg-green-900/20', 'text-green-800', 'dark:text-green-300', 'border-green-400');
            authStatusMessage.classList.add('bg-yellow-50', 'dark:bg-yellow-900/20', 'text-yellow-800', 'dark:text-yellow-300', 'border-yellow-400');
            
            // Temporary hide action bar and score to clean up PDF output
            const originalActionBarDisplay = actionBar.style.display;
            actionBar.style.display = 'none';

            try {
                // Ensure the window.jsPDF class is available (due to UMD load)
                const { jsPDF } = window.jspdf;
                if (!jsPDF) throw new Error("jsPDF library not found.");

                const input = quizDisplay;
                
                // 1. Capture the quiz display area as a canvas image
                const canvas = await html2canvas(input, {
                    scale: 2, // Use a higher scale for better quality PDF
                    logging: false,
                    useCORS: true,
                });

                const imgData = canvas.toDataURL('image/png');
                const pdf = new jsPDF('p', 'mm', 'a4'); // 'p' (portrait), 'mm' (unit), 'a4' (format)
                const imgWidth = 210; // A4 width in mm
                const pageHeight = 295; // A4 height in mm
                const imgHeight = canvas.height * imgWidth / canvas.width;
                let heightLeft = imgHeight;
                let position = 0;

                // 2. Add image to PDF, handling multiple pages if needed
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;

                while (heightLeft >= 0) {
                    position = heightLeft - imgHeight;
                    pdf.addPage();
                    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;
                }
                
                // 3. Save the PDF
                const filename = `AI_Quiz_PDF_${topicInput.value.replace(/\s/g, '_')}.pdf`;
                pdf.save(filename);
                
                // Show success message
                authStatusMessage.innerHTML = `<span class="font-bold">SUCCESS!</span> Quiz downloaded as ${filename}.`;
                authStatusMessage.classList.remove('bg-yellow-50', 'dark:bg-yellow-900/20', 'text-yellow-800', 'dark:text-yellow-300', 'border-yellow-400');
                authStatusMessage.classList.add('bg-green-50', 'dark:bg-green-900/20', 'text-green-800', 'dark:text-green-300', 'border-green-400');

            } catch (error) {
                console.error("PDF generation error:", error);
                authStatusMessage.innerHTML = `<span class="font-bold">Error!</span> Failed to generate PDF. See console.`;
                authStatusMessage.classList.remove('bg-yellow-50', 'dark:bg-yellow-900/20', 'text-yellow-800', 'dark:text-yellow-300', 'border-yellow-400');
                authStatusMessage.classList.add('bg-red-50', 'dark:bg-red-900/20', 'text-red-800', 'dark:text-red-300', 'border-red-400');
            } finally {
                // Restore UI state
                actionBar.style.display = originalActionBarDisplay;
            }
        };


        // --- Scoring and Feedback (omitted for brevity, assume correct from previous version) ---
        const calculateScoreAndDisplay = () => {
            stopTimer(); // Stop the timer immediately

            if (!currentQuiz) return;

            checkAnswersBtn.disabled = true;
            let correctCount = 0;
            const totalQuestions = currentQuiz.length;

            quizDisplay.querySelectorAll('.quiz-card').forEach((card, index) => {
                const correctIndex = parseInt(card.dataset.correctIndex);
                const optionsContainer = card.querySelector('.options-container');
                const explanationBtn = card.querySelector('.explanation-btn');
                const questionText = card.querySelector('.question-text').textContent.trim();
                let userSelectedOption = null;
                let isCorrect = false;

                optionsContainer.querySelectorAll('.option-item').forEach(optionItem => {
                    const optionIndex = parseInt(optionItem.dataset.optionIndex);
                    const radio = optionItem.querySelector(`input[name="q${index}"]`);
                    optionItem.classList.remove('bg-red-100', 'bg-green-100', 'dark:bg-red-900/30', 'dark:bg-green-900/50', 'shadow-lg');

                    // Highlight correct answer
                    if (optionIndex === correctIndex) {
                        const correctOptionText = optionItem.querySelector('label').textContent.trim();
                        optionItem.classList.add('bg-green-100', 'dark:bg-green-900/50', 'shadow-lg');
                        optionItem.style.pointerEvents = 'none'; // Lock options

                        // Check user selection
                        if (radio.checked) {
                            correctCount++;
                            isCorrect = true;
                        }
                        explanationBtn.dataset.correctOption = correctOptionText;
                    }

                    // Highlight wrong answer if selected
                    if (radio.checked && optionIndex !== correctIndex) {
                        optionItem.classList.add('bg-red-100/50', 'dark:bg-red-900/30');
                        userSelectedOption = optionItem.querySelector('label').textContent.trim();
                    }

                    // Lock all options after checking
                    radio.disabled = true;
                });

                // Show explanation button if the answer was wrong
                if (!isCorrect) {
                    explanationBtn.classList.remove('hidden');
                    explanationBtn.dataset.userChoice = userSelectedOption;
                }
            });

            // Display Score
            scoreDisplay.textContent = `You got ${correctCount}/${totalQuestions} correct! (${((correctCount / totalQuestions) * 100).toFixed(0)}%)`;
            scoreDisplay.classList.remove('hidden');
        };

        // --- Firestore Data Management (omitted for brevity, assume correct from previous version) ---

        /**
         * Get the correct path for the user's private collection.
         */
        const getQuizCollectionRef = () => {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            // Note: Since we are using manual demo login, we use a fixed userId for saving
            const effectiveUserId = isAuthenticated && userId ? userId : 'demo-user-id';
            return collection(db, `artifacts/${appId}/users/${effectiveUserId}/${QUIZ_COLLECTION_NAME}`);
        };

        /**
         * Saves the current quiz to Firestore.
         */
        const saveCurrentQuiz = async () => {
            if (!currentQuiz || !isAuthenticated || !isAuthReady) {
                // IMPORTANT: Replaced alert() with console.error/UI message for better UX
                console.error('Save failed: Must be logged in to the demo account.');
                authStatusMessage.innerHTML = `<span class="font-bold">Save Failed!</span> You must be logged in to save quizzes.`;
                authStatusMessage.classList.add('bg-red-50', 'dark:bg-red-900/20', 'text-red-800', 'dark:text-red-300', 'border-red-400');
                return;
            }

            const topic = topicInput.value.trim() || 'Untitled Quiz';
            const difficulty = document.getElementById('difficulty').value;

            try {
                const quizDoc = {
                    topic: topic,
                    difficulty: difficulty,
                    questionCount: currentQuiz.length,
                    timestamp: new Date().toISOString(),
                    quizData: currentQuiz, // Store the JSON array
                };

                await addDoc(getQuizCollectionRef(), quizDoc);
                // IMPORTANT: Replaced alert() with console.log and UI message for better UX
                authStatusMessage.innerHTML = `<span class="font-bold">SUCCESS!</span> Quiz "${topic}" saved successfully.`;
                authStatusMessage.classList.remove('bg-red-50', 'dark:bg-red-900/20', 'text-red-800', 'dark:text-red-300', 'border-red-400', 'bg-yellow-50', 'dark:bg-yellow-900/20', 'text-yellow-800', 'dark:text-yellow-300', 'border-yellow-400');
                authStatusMessage.classList.add('bg-green-50', 'dark:bg-green-900/20', 'text-green-800', 'dark:text-green-300', 'border-green-400');

            } catch (error) {
                console.error("Error saving quiz to Firestore:", error);
                // IMPORTANT: Replaced alert() with console.error/UI message for better UX
                authStatusMessage.innerHTML = `<span class="font-bold">Error!</span> Failed to save quiz. See console.`;
                authStatusMessage.classList.remove('bg-green-50', 'dark:bg-green-900/20', 'text-green-800', 'dark:text-green-300', 'border-green-400', 'bg-yellow-50', 'dark:bg-yellow-900/20', 'text-yellow-800', 'dark:text-yellow-300', 'border-yellow-400');
                authStatusMessage.classList.add('bg-red-50', 'dark:bg-red-900/20', 'text-red-800', 'dark:text-red-300', 'border-red-400');
            }
        };

        /**
         * Loads and displays all saved quizzes in the modal.
         */
        const loadSavedQuizzes = async () => {
            if (!isAuthenticated || !isAuthReady) {
                quizzesList.innerHTML = `<p class="text-center text-red-500">You must be logged in to the demo account to view saved quizzes.</p>`;
                myQuizzesModal.classList.remove('hidden');
                return;
            }

            noQuizzesMessage.textContent = 'Loading...';
            myQuizzesModal.classList.remove('hidden');
            quizzesList.innerHTML = '';

            try {
                const q = query(getQuizCollectionRef());
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    quizzesList.innerHTML = `<p class="text-center text-gray-500 dark:text-gray-400">You haven't saved any quizzes yet.</p>`;
                    return;
                }

                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    const date = new Date(data.timestamp).toLocaleDateString();
                    const item = document.createElement('div');
                    item.className = 'flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer';
                    item.innerHTML = `
                        <div>
                            <p class="font-semibold text-gray-900 dark:text-gray-50">${data.topic}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">ID: ${doc.id.substring(0, 5)} | ${data.questionCount} Qs | ${data.difficulty} | Saved: ${date}</p>
                        </div>
                        <button class="load-quiz-btn py-1 px-3 bg-primary-blue text-white rounded-md text-sm hover:bg-soft-blue" data-quiz-id="${doc.id}">Load</button>
                    `;
                    quizzesList.appendChild(item);
                });

                // Attach listener to load buttons
                quizzesList.querySelectorAll('.load-quiz-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const quizId = e.target.dataset.quizId;
                        await loadQuizById(quizId);
                        myQuizzesModal.classList.add('hidden');
                    });
                });

            } catch (error) {
                console.error("Error loading quizzes:", error);
                quizzesList.innerHTML = `<p class="text-center text-red-500">Error loading saved quizzes. See console.</p>`;
            }
        };

        /**
         * Loads a single quiz by its ID from Firestore.
         */
        const loadQuizById = async (quizId) => {
            loadingMessage.textContent = 'Loading saved quiz...';
            loading.classList.remove('hidden');

            try {
                const docRef = doc(getQuizCollectionRef(), quizId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    loadQuiz(data.quizData, { topic: data.topic, difficulty: data.difficulty });
                } else {
                    // IMPORTANT: Replaced alert() with console.error/UI message for better UX
                    console.error('Load failed: Quiz not found.');
                    authStatusMessage.innerHTML = `<span class="font-bold">Error!</span> Quiz not found.`;
                    authStatusMessage.classList.add('bg-red-50', 'dark:bg-red-900/20', 'text-red-800', 'dark:text-red-300', 'border-red-400');
                }
            } catch (error) {
                console.error("Error loading single quiz:", error);
                 // IMPORTANT: Replaced alert() with console.error/UI message for better UX
                authStatusMessage.innerHTML = `<span class="font-bold">Error!</span> Failed to load quiz. See console.`;
                authStatusMessage.classList.add('bg-red-50', 'dark:bg-red-900/20', 'text-red-800', 'dark:text-red-300', 'border-red-400');
            } finally {
                loading.classList.add('hidden');
            }
        };

        // --- Event Listeners ---

        /**
         * Handles the manual demo login logic.
         */
        const handleDemoLogin = () => {
            const email = loginEmail.value.trim();
            const password = loginPassword.value.trim();

            // Allow successful demo login if ANY email and password are provided (not empty).
            if (email.length > 0 && password.length > 0) {
                isAuthenticated = true;
                
                // Update authentication UI to reflect successful login
                authStatus.innerHTML = `ID: <span class="font-semibold">DEMO-USER</span>`;
                authStatusMessage.innerHTML = `**SUCCESS!** Logged in as **${email}**. Quiz saving and loading is **enabled**.`;
                authStatusMessage.classList.remove('bg-yellow-50', 'dark:bg-yellow-900/20', 'text-yellow-800', 'dark:text-yellow-300', 'border-yellow-400', 'bg-red-50', 'dark:bg-red-900/20', 'text-red-800', 'dark:text-red-300', 'border-red-400');
                authStatusMessage.classList.add('bg-green-50', 'dark:bg-green-900/20', 'text-green-800', 'dark:text-green-300', 'border-green-400');
                myQuizzesBtn.disabled = false;
                saveQuizBtn.disabled = false;

                // Transition the view
                document.body.classList.remove('flex', 'items-center', 'justify-center');
                authView.classList.add('hidden');
                generatorView.classList.remove('hidden');
                appHeader.classList.remove('hidden');

            } else {
                // Show failure message if fields are empty
                authStatusMessage.innerHTML = `<span class="font-bold">Login Failed!</span> Please enter both an Email and a Password to start the demo.`;
                authStatusMessage.classList.remove('bg-green-50', 'dark:bg-green-900/20', 'text-green-800', 'dark:text-green-300', 'border-green-400', 'bg-yellow-50', 'dark:bg-yellow-900/20', 'text-yellow-800', 'dark:text-yellow-300', 'border-yellow-400');
                authStatusMessage.classList.add('bg-red-50', 'dark:bg-red-900/20', 'text-red-800', 'dark:text-red-300', 'border-red-400');
            }
        };

        // App Start Button (Now triggers manual demo login)
        startAppBtn.addEventListener('click', handleDemoLogin);
        // Also allow pressing Enter in the password field
        loginPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleDemoLogin();
            }
        });

        // Main event listeners
        generateQuizBtn.addEventListener('click', () => handleGenerateQuiz(false));
        refreshQuizBtn.addEventListener('click', () => handleGenerateQuiz(true));
        generateFromTextBtn.addEventListener('click', () => {
            const text = textInput.value.trim();
            handleGenerateQuiz(false, text);
        });
        themeToggle.addEventListener('click', toggleTheme);
        checkAnswersBtn.addEventListener('click', calculateScoreAndDisplay);
        saveQuizBtn.addEventListener('click', saveCurrentQuiz);
        downloadQuizPdfBtn.addEventListener('click', downloadQuizAsPdf); // New PDF Listener

        // Timer/Challenge Mode toggle
        challengeModeToggle.addEventListener('change', (e) => {
            if (e.target.checked && currentQuiz) {
                startTimer();
            } else {
                stopTimer();
            }
        });

        // My Quizzes Modal
        myQuizzesBtn.addEventListener('click', loadSavedQuizzes);
        closeQuizzesModal.addEventListener('click', () => myQuizzesModal.classList.add('hidden'));

        // Delegate listener for Hint, Explanation, and Edit buttons
        quizDisplay.addEventListener('click', (e) => {
            const card = e.target.closest('.quiz-card');
            const qIndex = parseInt(card?.dataset.questionIndex);

            if (e.target.closest('.hint-btn')) {
                const hintBtn = e.target.closest('.hint-btn');
                const questionText = card.querySelector('.question-text').textContent.trim();
                handleHint(questionText, hintBtn);
            }
            else if (e.target.closest('.explanation-btn')) {
                const explanationBtn = e.target.closest('.explanation-btn');
                const questionText = card.querySelector('.question-text').textContent.trim();
                const correctOption = explanationBtn.dataset.correctOption;
                const userChoice = explanationBtn.dataset.userChoice;
                handleExplanation(questionText, correctOption, explanationBtn, userChoice);
            }
            else if (e.target.closest('.edit-btn')) {
                const editBtn = e.target.closest('.edit-btn');
                const isEditing = editBtn.dataset.state === 'edit';

                // Toggle state
                editBtn.dataset.state = isEditing ? 'view' : 'edit';
                editBtn.textContent = isEditing ? 'Edit' : 'Save';

                // Make content editable
                card.querySelectorAll('[contenteditable]').forEach(el => {
                    el.contentEditable = !isEditing;
                    if (!isEditing) {
                        el.classList.add('border-b', 'border-dashed', 'border-primary-blue/50');
                    } else {
                        el.classList.remove('border-b', 'border-dashed', 'border-primary-blue/50');
                    }
                });

                if (isEditing && currentQuiz && currentQuiz[qIndex]) {
                    // Save changes back to currentQuiz when toggling from edit to view
                    currentQuiz[qIndex].question = card.querySelector('.question-text').textContent.trim();
                    currentQuiz[qIndex].options = Array.from(card.querySelectorAll('[data-field="option"]')).map(el => el.textContent.trim());
                }
            }
            else if (e.target.closest('.option-item')) {
                // Handle radio button selection (visual feedback only, actual check is on button click)
                const radio = e.target.closest('.option-item').querySelector('input[type="radio"]');
                if (radio && !radio.disabled) {
                    radio.checked = true;
                }
            }
        });

        // Download Quiz (.txt)
        downloadQuizBtn.addEventListener('click', () => {
            if (!currentQuiz) { 
                // IMPORTANT: Replaced alert() with console.error/UI message for better UX
                console.error('Download failed: Generate a quiz first!'); 
                authStatusMessage.innerHTML = `<span class="font-bold">Error!</span> Generate a quiz first to download.`;
                authStatusMessage.classList.remove('bg-green-50', 'dark:bg-green-900/20', 'text-green-800', 'dark:text-green-300', 'border-green-400', 'bg-yellow-50', 'dark:bg-yellow-900/20', 'text-yellow-800', 'dark:text-yellow-300', 'border-yellow-400');
                authStatusMessage.classList.add('bg-red-50', 'dark:bg-red-900/20', 'text-red-800', 'dark:text-red-300', 'border-red-400');
                return; 
            }

            let textContent = `Custom AI Quiz - Topic: ${topicInput.value} (Difficulty: ${document.getElementById('difficulty').value})\n\n`;

            currentQuiz.forEach((q, index) => {
                textContent += `Question ${index + 1}: ${q.question}\n`;
                q.options.forEach((opt, optIndex) => {
                    textContent += `  ${String.fromCharCode(65 + optIndex)}. ${opt}\n`;
                });
                textContent += `\nCorrect Answer: ${String.fromCharCode(65 + q.correctIndex)}\n\n`;
            });

            const blob = new Blob([textContent], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `AI_Quiz_${topicInput.value.replace(/\s/g, '_')}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Show success message
            authStatusMessage.innerHTML = `<span class="font-bold">SUCCESS!</span> Quiz downloaded as ${a.download}.`;
            authStatusMessage.classList.remove('bg-red-50', 'dark:bg-red-900/20', 'text-red-800', 'dark:text-red-300', 'border-red-400', 'bg-yellow-50', 'dark:bg-yellow-900/20', 'text-yellow-800', 'dark:text-yellow-300', 'border-yellow-400');
            authStatusMessage.classList.add('bg-green-50', 'dark:bg-green-900/20', 'text-green-800', 'dark:text-green-300', 'border-green-400');
        });

        // --- Initialization ---

        window.onload = async function() {
            // 0. Set initial layout to center the auth view
            document.body.classList.add('flex', 'items-center', 'justify-center');

            // 1. Initialize Firebase
            const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

            if (Object.keys(firebaseConfig).length > 0) {
                const app = initializeApp(firebaseConfig);
                auth = getAuth(app);
                db = getFirestore(app);
                console.log("Firebase Initialized for App ID:", appId);

                // 2. Handle Authentication
                onAuthStateChanged(auth, async (user) => {
                    isAuthReady = true;
                    initialLoading.classList.add('hidden');
                    authView.classList.remove('hidden');
                    startAppBtn.disabled = false;

                    // We still use the default user for initial setup, but switch control to manual login
                    if (user) {
                        userId = user.uid;
                        const shortId = userId.substring(0, 5);

                        authStatus.textContent = `ID: ${shortId}... (Guest)`;
                        authStatusMessage.innerHTML = `**Status:** Signed in as **Guest**. Enter your **Email** and **Password** to start the app demo.`;
                        myQuizzesBtn.disabled = true;
                        saveQuizBtn.disabled = true;
                    } else {
                        // Should not happen after initial sign-in attempt, but for safety
                        userId = crypto.randomUUID();
                        authStatus.textContent = `ID: ${userId.substring(0, 5)}... (Guest)`;
                        authStatusMessage.innerHTML = `Sign-in failed. Proceeding as **Anonymous Guest**. Enter your **Email** and **Password** to start the app demo.`;
                        myQuizzesBtn.disabled = true;
                        saveQuizBtn.disabled = true;
                    }
                });

                // Attempt sign-in using the provided custom token or anonymously
                try {
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (error) {
                    console.error("Initial sign-in failed, falling back to anonymous:", error);
                    await signInAnonymously(auth);
                }

                // 3. Set initial theme
                const savedTheme = localStorage.getItem('theme');
                if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    isDarkMode = false;
                    toggleTheme();
                } else {
                    isDarkMode = true;
                    toggleTheme();
                }
            } else {
                console.warn("Firebase configuration not found. Running in offline/guest mode.");
                initialLoading.classList.add('hidden');
                authView.classList.remove('hidden');
                startAppBtn.disabled = false;

                userId = crypto.randomUUID();
                isAuthReady = true;
                authStatus.textContent = 'Guest (Offline)';
                authStatusMessage.innerHTML = `**Status:** Running Offline. Enter your **Email** and **Password** to start the app demo.`;
                myQuizzesBtn.disabled = true;
                saveQuizBtn.disabled = true;
                toggleTheme();
            }
        };

    

