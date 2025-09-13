// Add this line at the top of your script to update the footer date
document.addEventListener('DOMContentLoaded', function() {
    const date = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    document.getElementById('lastUpdated').textContent += date.toLocaleDateString('en-IN', options) + ' (IST)';
});

// --------------------- SUPABASE CONFIG: REPLACE THESE ---------------------
const SUPABASE_URL = 'https://gvdfqcljvkkisnvoubkw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2ZGZxY2xqdmtraXNudm91Ymt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0NzM2ODQsImV4cCI6MjA3MzA0OTY4NH0.accgwK0kOLpq1AD6NqraDNSAyxrLwCoxyxfMBJAacIk';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --------------------- Improved Map Initialization ---------------------
let reportMap = null;
let marker = null;
let selectedCoords = null;
let mapInitialized = false;

function initializeReportMap() {
    if (mapInitialized) {
        reportMap.invalidateSize();
        return;
    }
    
    reportMap = L.map('map-picker').setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(reportMap);

    marker = L.marker([20.5937, 78.9629], { draggable: true }).addTo(reportMap);
    marker.bindPopup("Drag me to the problem location, or click on the map.").openPopup();

    reportMap.on('click', function(e) {
        selectedCoords = e.latlng;
        marker.setLatLng(selectedCoords);
        marker.getPopup().setContent(`Location selected at: ${selectedCoords.lat.toFixed(4)}, ${selectedCoords.lng.toFixed(4)}`).openOn(reportMap);
        updateLocationFromCoords(selectedCoords);
    });
    
    marker.on('dragend', function(event){
        selectedCoords = event.target.getLatLng();
        marker.setLatLng(selectedCoords);
        marker.getPopup().setContent(`Location selected at: ${selectedCoords.lat.toFixed(4)}, ${selectedCoords.lng.toFixed(4)}`).openOn(reportMap);
        updateLocationFromCoords(selectedCoords);
    });
    mapInitialized = true;
}

// --------------------- New Geocoding Search Function ---------------------
async function searchLocation() {
    const query = document.getElementById('locationSearch').value.trim();
    if (!query) {
        showStatusMessage("Please enter a location to search.", 'error');
        return;
    }
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=IN&limit=1`);
        const data = await response.json();
        if (data && data.length > 0) {
            const result = data[0];
            const latlng = [parseFloat(result.lat), parseFloat(result.lon)];
            selectedCoords = L.latLng(latlng[0], latlng[1]);
            marker.setLatLng(selectedCoords);
            reportMap.setView(selectedCoords, 16);
            updateLocationFromCoords(selectedCoords, result.display_name);
            showStatusMessage("Location found and pinned on the map.", 'success');
        } else {
            showStatusMessage("No location found. Try a different search term.", 'error');
        }
    } catch (e) {
        showStatusMessage("Search failed. Please try again.", 'error');
        console.error("Geocoding search failed:", e);
    }
}
function updateLocationFromCoords(coords, address = null) {
    if (address) {
        document.getElementById('locationTxt').value = address;
        return;
    }
    // Reverse geocoding (optional, more complex) or just use coordinates
    document.getElementById('locationTxt').value = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
}

// --------------------- Helpers ---------------------
function dataURLtoFile(dataurl, filename) {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while(n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mime });
}

async function uploadFileToBucket(path, file) {
  const { data, error } = await supabaseClient.storage.from('reports').upload(path, file, { upsert: false });
  if (error) throw error;
  return data;
}

async function getSignedUrlForPath(path, expires = 60 * 60) {
  const { data, error } = await supabaseClient.storage.from('reports').createSignedUrl(path, expires);
  if (error) throw error;
  return data?.signedUrl || null;
}

function getPublicUrlForPath(path) {
  const { data } = supabaseClient.storage.from('reports').getPublicUrl(path);
  return data?.publicUrl || null;
}
// --------------------- AI Voice Summary Functions ---------------------
async function speakReportSummary() {
    // First, stop any speech that is currently happening
    stopSpeaking();

    if (!('speechSynthesis' in window)) {
        showStatusMessage('Sorry, your browser does not support text-to-speech.', 'error');
        return;
    }

    try {
        // Fetch the same data that the dashboard uses
        const filterBy = document.getElementById('filterAdminReports').value;
        let query = supabaseClient.from('reports').select('status, cat');
        if (filterBy !== 'all') {
            query = query.eq('status', filterBy);
        }
        
        const { data: rows, error } = await query;
        if (error) throw error;
        
        if (rows.length === 0) {
            const utterance = new SpeechSynthesisUtterance("There are no reports matching the current filter.");
            window.speechSynthesis.speak(utterance);
            return;
        }

        // Create a summary text
        const totalReports = rows.length;
        const categoryCounts = rows.reduce((acc, report) => {
            acc[report.cat] = (acc[report.cat] || 0) + 1;
            return acc;
        }, {});

        let summaryText = `There are ${totalReports} reports. `;
        if(filterBy !== 'all') {
            summaryText = `There are ${totalReports} reports with the status ${filterBy}. `;
        }
        
        summaryText += "The breakdown by category is as follows: ";
        
        for (const [category, count] of Object.entries(categoryCounts)) {
            summaryText += `${count} for ${category}, `;
        }

        // Create an utterance and speak it
        const utterance = new SpeechSynthesisUtterance(summaryText);
        utterance.lang = document.getElementById('languageSelector').value; // Optional: use selected language
        utterance.rate = 0.9; // A slightly slower rate is often clearer
        window.speechSynthesis.speak(utterance);

    } catch (e) {
        console.error("Could not fetch reports for voice summary:", e);
        const utterance = new SpeechSynthesisUtterance("I'm sorry, I was unable to retrieve the report data.");
        window.speechSynthesis.speak(utterance);
    }
}

function stopSpeaking() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
}
// --------------------- Speech Recognition (Voice-to-Text)---------------------
let recognition;
let isRecognizing = false;
const voiceInputBtn = document.getElementById('voiceInputBtn');
const voiceStatus = document.getElementById('voiceStatus');
const issueDescTextarea = document.getElementById('issueDesc');

// Check if the browser supports the Web Speech API
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
    voiceInputBtn.disabled = true;
    voiceStatus.textContent = "Sorry, your browser doesn't support voice input.";
} else {
    recognition = new SpeechRecognition();

    // Fired when speech is recognized
    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
        // Append the new transcript to the existing text
        issueDescTextarea.value += (issueDescTextarea.value.length > 0 ? ' ' : '') + transcript + '.';
    };
    
    // Fired when recognition starts
    recognition.onstart = () => {
        isRecognizing = true;
        voiceStatus.textContent = "Listening... please speak now.";
        voiceInputBtn.innerHTML = "🛑 Stop Listening";
        voiceInputBtn.classList.add('btn-danger');
    };

    // Fired when recognition ends
    recognition.onend = () => {
        isRecognizing = false;
        voiceStatus.textContent = "";
        voiceInputBtn.innerHTML = "🎤 Start Voice Input";
        voiceInputBtn.classList.remove('btn-danger');
    };
    
    // Fired on error
    recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
            voiceStatus.textContent = "Error: Microphone access was denied.";
        } else {
            voiceStatus.textContent = "Error: " + event.error;
        }
    };
}

function toggleVoiceRecognition() {
    if (!SpeechRecognition) return;
    
    if (isRecognizing) {
        recognition.stop();
    } else {
        // Map language codes to specific dialects for better accuracy
        const langMap = {
            'en': 'en-IN', // English (India)
            'hi': 'hi-IN', // Hindi (India)
            'mr': 'mr-IN', // Marathi (India)
            'or': 'or-IN', // Oriya (India)
            'ur': 'ur-IN'  // Urdu (India)
        };
        const currentLang = document.getElementById('languageSelector').value;
        recognition.lang = langMap[currentLang] || 'en-IN';
        
        recognition.start();
    }
}
// --------------------- Quick Links Modal Logic ---------------------
const quickLinkModal = document.getElementById('quickLinkModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');

const quickLinkContent = {
    about: {
        title: "About Us",
        body: `<h3>Welcome to the Civic Portal</h3>
                         <p>This portal is a dedicated initiative for the citizens of Patna, developed by <strong>Team Civic Sparks</strong> for the Government of India. It is designed and maintained by the National Informatics Centre (NIC).</p>
                         <p>Our mission is to provide a modern, accessible, and efficient platform for residents to report local civic issues. By leveraging technology, including AI-powered categorization and voice input, we aim to bridge the gap between citizens and administration, ensuring that grievances related to sanitation, water logging, electricity, and other essential services are addressed transparently and promptly.</p>
                         <p>© 2024 Civic Sparks. All Rights Reserved.</p>`
    },
    policies: {
        title: "Website Policies",
        body: `<h3>Privacy Policy</h3>
                         <p>Your privacy is important to us. This policy explains how we handle and treat your data.</p>
                         <ul>
                             <li><strong>Information Collection:</strong> We collect personal information (name, email via Google Sign-In) and report details (description, location, media files) solely for the purpose of addressing civic complaints.</li>
                             <li><strong>Use of Information:</strong> Your information is used to register, assign, and track complaints with the relevant municipal departments. We do not sell or rent personal data to third parties.</li>
                             <li><strong>Data Security:</strong> We use industry-standard security measures, including secure cloud storage via Supabase, to protect your data from unauthorized access.</li>
                         </ul>
                         <h3>Terms of Service</h3>
                         <p>By using this portal, you agree to the following terms:</p>
                         <ul>
                             <li>You will provide accurate and truthful information in your reports.</li>
                             <li>You will not submit content that is unlawful, obscene, defamatory, or otherwise objectionable.</li>
                             <li>Misuse of this platform for spam, false reports, or malicious activities may result in a temporary or permanent ban from our service.</li>
                         </ul>`
    },
    help: {
        title: "Help & Support",
        body: `<h3>Getting Started</h3>
                         <p>This site is designed to make reporting civic issues in Patna as easy as possible.</p>
                         <p><strong>Step 1: Choose Your Role</strong><br>Select "I am a User" to begin the reporting process.</p>
                         <p><strong>Step 2: Sign In Securely</strong><br>Use your Google account for a quick and secure sign-in. We only use your email to identify your reports.</p>
                         <p><strong>Step 3: Report an Issue</strong><br>
                           <ul>
                                 <li><strong>Voice Input:</strong> Click the 🎤 button to describe the issue using your voice.</li>
                                 <li><strong>Category:</strong> Our AI will try to select a category for you based on your description. You can also change it manually.</li>
                                 <li><strong>Location:</strong> Pin the exact location on the map for a faster response from municipal teams.</li>
                                 <li><strong>Proof:</strong> Upload images, video, or audio directly from your device to provide clear evidence.</li>
                             </ul>
                         </p>
                         <p><strong>Step 4: Track Your Reports</strong><br>All your submissions appear under the "My Reports" section, where you can see their current status (Submitted, In Progress, Resolved).</p>`
    },
    contact: {
        title: "Contact Us",
        body: `<h3>Get in Touch</h3>
                         <p>For urgent issues or if you need to speak with a representative, please use the contact details below.</p>
                         <p><strong>Civic Helpline Number (24/7):</strong><br>
                         1800-180-1234</p>
                         <p><strong>General Inquiries (Municipal Office):</strong><br>
                         Email: <a href="mailto:contact@civicportal.gov.in">contact@civicportal.gov.in</a></p>
                         <p><strong>Technical Support (Team Civic Sparks):</strong><br>
                         Email: <a href="mailto:team.civicsparks@gmail.com">team.civicsparks@gmail.com</a></p>`
    }
};

function showQuickLinkModal(type) {
    if (quickLinkContent[type]) {
        modalTitle.textContent = quickLinkContent[type].title;
        modalBody.innerHTML = quickLinkContent[type].body;
        quickLinkModal.classList.add('visible');
    }
}

function closeQuickLinkModal() {
    quickLinkModal.classList.remove('visible');
}

// --------------------- AI Auto-Categorization Function ---------------------
async function autoCategorizeIssue() {
    const description = document.getElementById('issueDesc').value.trim();
    if (description.length < 10) return; // Don't run for very short descriptions

    // --- IMPORTANT: Replace with your actual API key ---
    const API_KEY = 'AIzaSyCEASQob96dMkeZO5HCzK8Xup65uhYAJ6Q';
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;

    // The categories must match the 'value' attributes in your HTML select options
    const categories = ['Electricity', 'Water', 'Streetlight', 'Road', 'Sanitation'];

    const prompt = `Based on the following user complaint, classify it into one of these exact categories: ${categories.join(', ')}. Return only the single category name and nothing else. Complaint: "${description}"`;

    showStatusMessage('Analyzing description to suggest a category...', 'success');

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();
        const category = data.candidates[0].content.parts[0].text.trim();

        // Check if the AI returned a valid category
        if (categories.includes(category)) {
            document.getElementById('issueCat').value = category;
            showStatusMessage(`Suggested Category: ${category}`, 'success');
        } else {
             console.warn('AI returned an invalid category:', category);
        }

    } catch (error) {
        console.error('AI categorization failed:', error);
        showStatusMessage('Could not auto-suggest category.', 'error');
    }
}


// --------------------- Navigation ---------------------
function gotoPage(id) {
    const pages = ['page0', 'userLogin', 'adminLogin', 'page3', 'page4'];
    pages.forEach(p => {
        document.getElementById(p).classList.add('hidden');
    });
    document.getElementById(id).classList.remove('hidden');

    if (id === 'page3') {
        renderUserReports();
        setTimeout(() => initializeReportMap(), 100);
    }
    if (id === 'page4') {
        renderAllReports();
        updateCharts();
    }
}

// --------------------- Google Sign-in + Supabase auth exchange ---------------------
let currentUserEmail = null;
let currentUserId = null;

function decodeJwt(token){
  try{
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g,'+').replace(/_/g,'/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c=>'%' + ('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return JSON.parse(jsonPayload);
  } catch(e) { return null; }
}

async function handleCredentialResponse(response){
  const payload = decodeJwt(response.credential);
  if(!payload || !payload.email){ showStatusMessage(translations[currentLang].signInFailedAlert, 'error'); return; }

  try {
    await supabaseClient.auth.signInWithIdToken({ provider: 'google', token: response.credential }).catch(e=>console.warn(e));
    const { data: sessData } = await supabaseClient.auth.getSession();
    const supUser = sessData?.session?.user;
    currentUserEmail = supUser?.email ?? payload.email;
    currentUserId = supUser?.id ?? null;
    localStorage.setItem('civic_current_user', currentUserEmail);
    if (currentUserId) localStorage.setItem('civic_user_id', currentUserId);
    gotoPage('page3');
  } catch (err) {
    console.error(err);
    showStatusMessage(translations[currentLang].signInErrorAlert, 'error');
  }
}

supabaseClient.auth.onAuthStateChange((event, session) => {
  const user = session?.user ?? null;
  if(user) {
    currentUserEmail = user.email;
    currentUserId = user.id;
    localStorage.setItem('civic_current_user', currentUserEmail);
    localStorage.setItem('civic_user_id', currentUserId);
  } else {
    currentUserEmail = null;
    currentUserId = null;
    localStorage.removeItem('civic_current_user');
    localStorage.removeItem('civic_user_id');
  }
});

// --------------------- Admin Login ---------------------
async function adminLogin(){
  const id = document.getElementById('adminId').value.trim();
  const pass = document.getElementById('adminPass').value.trim();
  const err = document.getElementById('adminError');

  if (id === 'civic01') {
    try {
      const email = 'civic01@yourdomain.com';
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      err.classList.add('hidden');
      document.getElementById('adminId').value = '';
      document.getElementById('adminPass').value = '';
      gotoPage('page4');
    } catch (e) {
      console.error(e);
      err.classList.remove('hidden');
    }
  } else {
    err.classList.remove('hidden');
  }
}

// --------------------- Toggle Password Visibility ---------------------
function togglePasswordVisibility() {
  const passInput = document.getElementById('adminPass');
  const toggleBtn = document.querySelector('.password-toggle-btn');
  if (passInput.type === 'password') {
    passInput.type = 'text';
    toggleBtn.textContent = '🙈';
  } else {
    passInput.type = 'password';
    toggleBtn.textContent = '👁';
  }
}

// --------------------- Media Capture ---------------------
let camStream=null, vidRecorder=null, vidChunks=[], audRecorder=null, audChunks=[];

const imgVideo=document.getElementById('imgVideo');
const imgCanvas=document.getElementById('imgCanvas');
const imgPreview=document.getElementById('imgPreview');
const removeImgBtn=document.getElementById('removeImgBtn');

document.getElementById('startCamBtn').onclick=async()=>{
  try {
    camStream=await navigator.mediaDevices.getUserMedia({video:true});
    imgVideo.srcObject=camStream;
    imgVideo.classList.remove('hidden');
    document.getElementById('imgCamControls').classList.remove('hidden');
  } catch (error) {
    console.error("Error accessing camera:", error);
    showStatusMessage(translations[currentLang].cameraErrorAlert, 'error');
  }
};
document.getElementById('takePhotoBtn').onclick=()=>{
  imgCanvas.width=imgVideo.videoWidth; imgCanvas.height=imgVideo.videoHeight;
  imgCanvas.getContext('2d').drawImage(imgVideo,0,0);
  imgPreview.src=imgCanvas.toDataURL('image/png'); imgPreview.classList.remove('hidden');
  removeImgBtn.classList.remove('hidden');
};
document.getElementById('stopCamBtn').onclick=()=>{
  if(camStream){camStream.getTracks().forEach(t=>t.stop()); camStream=null;}
  imgVideo.classList.add('hidden'); document.getElementById('imgCamControls').classList.add('hidden');
};
removeImgBtn.onclick=()=>{imgPreview.classList.add('hidden'); removeImgBtn.classList.add('hidden');};

const vidPreview=document.getElementById('vidPreview');
const removeVidBtn=document.getElementById('removeVidBtn');

document.getElementById('startVidRec').onclick=async()=>{
  try {
    const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
    vidRecorder=new MediaRecorder(stream); vidChunks=[];
    vidRecorder.ondataavailable=e=>vidChunks.push(e.data);
    vidRecorder.onstop=()=>{vidPreview.src=URL.createObjectURL(new Blob(vidChunks,{type:'video/webm'})); vidPreview.classList.remove('hidden'); removeVidBtn.classList.remove('hidden');};
    vidRecorder.start();
    document.getElementById('stopVidRec').classList.remove('hidden'); document.getElementById('startVidRec').classList.add('hidden');
  } catch (error) {
    console.error("Error accessing video recorder:", error);
    showStatusMessage(translations[currentLang].videoRecorderErrorAlert, 'error');
  }
};

document.getElementById('stopVidRec').onclick=()=>{ if(vidRecorder){vidRecorder.stop(); vidRecorder=null;} document.getElementById('stopVidRec').classList.add('hidden'); document.getElementById('startVidRec').classList.remove('hidden'); };
removeVidBtn.onclick=()=>{vidPreview.classList.add('hidden'); removeVidBtn.classList.add('hidden');};

const audPreview=document.getElementById('audPreview');
const removeAudBtn=document.getElementById('removeAudBtn');

document.getElementById('startAudRec').onclick=async()=>{
  try {
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    audRecorder=new MediaRecorder(stream); audChunks=[];
    audRecorder.ondataavailable=e=>audChunks.push(e.data);
    audRecorder.onstop=()=>{audPreview.src=URL.createObjectURL(new Blob(audChunks,{type:'audio/webm'})); audPreview.classList.remove('hidden'); removeAudBtn.classList.remove('hidden');};
    audRecorder.start();
    document.getElementById('stopAudRec').classList.add('hidden'); document.getElementById('startAudRec').classList.remove('hidden');
  } catch (error) {
    console.error("Error accessing audio recorder:", error);
    showStatusMessage(translations[currentLang].audioRecorderErrorAlert, 'error');
  }
};

document.getElementById('stopAudRec').onclick=()=>{ if(audRecorder){audRecorder.stop(); audRecorder=null;} document.getElementById('stopAudRec').classList.add('hidden'); document.getElementById('startAudRec').classList.remove('hidden'); };
removeAudBtn.onclick=()=>{audPreview.classList.add('hidden'); removeAudBtn.classList.add('hidden');};

// --------------------- Submit, Render, and other functions... ---------------------
function showStatusMessage(message, type = 'success', duration = 3000) {
    const statusMsg = document.getElementById('statusMessage');
    statusMsg.textContent = message;
    statusMsg.className = `status-message show ${type}`;
    setTimeout(() => {
        statusMsg.classList.remove('show');
    }, duration);
}

async function submitReport() {
    const current = localStorage.getItem('civic_current_user') || currentUserEmail;
    const userId = localStorage.getItem('civic_user_id') || currentUserId;

    if (!current) {
        showStatusMessage(translations[currentLang].signInFirstAlert, 'error');
        gotoPage('userLogin');
        return;
    }
    const desc = document.getElementById('issueDesc').value.trim();
    const cat = document.getElementById('issueCat').value;
    const loc = document.getElementById('locationTxt').value.trim();
    if (!desc || !cat || !loc) {
        showStatusMessage(translations[currentLang].fillRequiredFieldsAlert, 'error');
        return;
    }

    let img_path = null;
    let vid_path = null;
    let aud_path = null;
    
    try {
        if (!imgPreview.classList.contains('hidden')) {
            const imgFile = dataURLtoFile(imgPreview.src, `report_${Date.now()}_image.png`);
            img_path = `images/${userId}/${Date.now()}_image.png`;
            await uploadFileToBucket(img_path, imgFile);
        } else if (imgUpload.files.length > 0) {
            img_path = `images/${userId}/${Date.now()}_${imgUpload.files[0].name}`;
            await uploadFileToBucket(img_path, imgUpload.files[0]);
        }
        
        if (!vidPreview.classList.contains('hidden')) {
            const vidBlob = new Blob(vidChunks, {type: 'video/webm'});
            const vidFile = new File([vidBlob], `report_${Date.now()}_video.webm`, {type: 'video/webm'});
            vid_path = `videos/${userId}/${Date.now()}_video.webm`;
            await uploadFileToBucket(vid_path, vidFile);
        } else if (vidUpload.files.length > 0) {
            vid_path = `videos/${userId}/${Date.now()}_${vidUpload.files[0].name}`;
            await uploadFileToBucket(vid_path, vidUpload.files[0]);
        }
        
        if (!audPreview.classList.contains('hidden')) {
            const audBlob = new Blob(audChunks, {type: 'audio/webm'});
            const audFile = new File([audBlob], `report_${Date.now()}_audio.webm`, {type: 'audio/webm'});
            aud_path = `audios/${userId}/${Date.now()}_audio.webm`;
            await uploadFileToBucket(aud_path, audFile);
        } else if (audUpload.files.length > 0) {
            aud_path = `audios/${userId}/${Date.now()}_${audUpload.files[0].name}`;
            await uploadFileToBucket(aud_path, audUpload.files[0]);
        }
    } catch (e) {
        console.error('File upload failed', e);
        showStatusMessage('File upload failed: ' + (e.message || e), 'error');
        return;
    }

    try {
        const repId = Date.now();
        const {
            data,
            error
        } = await supabaseClient.from('reports').insert([{
            id: repId,
            user_email: current,
            desc,
            cat,
            location: loc,
            lat: selectedCoords ? selectedCoords.lat : null,
            lng: selectedCoords ? selectedCoords.lng : null,
            img_url: img_path,
            vid_url: vid_path,
            aud_url: aud_path,
            status: 'Submitted'
        }]);
        if (error) throw error;

        document.getElementById('issueDesc').value = '';
        document.getElementById('issueCat').value = '';
        document.getElementById('locationTxt').value = '';
        document.getElementById('locationSearch').value = '';
        selectedCoords = null;
        if (marker) { marker.setLatLng([20.5937, 78.9629]); }
        
        imgPreview.classList.add('hidden');
        vidPreview.classList.add('hidden');
        audPreview.classList.add('hidden');
        removeImgBtn.classList.add('hidden');
        removeVidBtn.classList.add('hidden');
        removeAudBtn.classList.add('hidden');

        showStatusMessage(translations[currentLang].reportSuccessMsg, 'success');
        renderUserReports();
        updateCharts();
    } catch (e) {
        console.error('DB insert failed', e);
        showStatusMessage(translations[currentLang].saveReportFailedAlert + (e.message || e), 'error');
    }
}

async function submitRating(reportId, rating) {
    try {
        const { error } = await supabaseClient
            .from('reports')
            .update({ rating: rating })
            .eq('id', reportId);
        if (error) throw error;
        showStatusMessage('Thank you for your feedback!', 'success');
        renderUserReports();
    } catch (e) {
        showStatusMessage('Could not submit rating. Please try again.', 'error');
        console.error('Rating submission failed', e);
    }
}
async function renderUserReports(){
  const reportsList = document.getElementById('userReports');
  reportsList.innerHTML = `<p class="small">${translations[currentLang].loadingMessage}</p>`;
  const current = localStorage.getItem('civic_current_user') || currentUserEmail;
  if(!current){ reportsList.innerHTML = `<p class="small">${translations[currentLang].signInToViewReports}</p>`; return; }

  try {
    let { data: rows, error } = await supabaseClient.from('reports').select('*').eq('user_email', current);
    if(error) throw error;

    const sortBy = document.getElementById('sortUserReports').value;
    if (sortBy === 'status') {
        rows.sort((a, b) => a.status.localeCompare(b.status));
    } else if (sortBy === 'category') {
        rows.sort((a, b) => a.cat.localeCompare(b.cat));
    } else if (sortBy === 'dateAsc') {
        rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else { // dateDesc is default
        rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    reportsList.innerHTML = '';
    if (rows.length === 0) {
        reportsList.innerHTML = `<p class="small">You have not submitted any reports yet.</p>`;
        return;
    }
    for (const r of rows){
        let mediaHtml = '<div style="display:flex; gap:10px; flex-wrap:wrap;">';
        if (r.img_url) {
            mediaHtml += `<div><p class="small"><b>Your Submission (Before):</b></p><img src="${getPublicUrlForPath(r.img_url)}" class="preview" style="max-height:150px;"></div>`;
        }
        if (r.resolution_image_url) {
            mediaHtml += `<div><p class="small"><b>Resolution Proof (After):</b></p><img src="${getPublicUrlForPath(r.resolution_image_url)}" class="preview" style="max-height:150px;"></div>`;
        }
        mediaHtml += '</div>';
        if (r.vid_url) mediaHtml += `<div style="margin-top:8px"><video src="${getPublicUrlForPath(r.vid_url)}" controls class="preview" style="max-height:150px;"></video></div>`;
        if (r.aud_url) mediaHtml += `<div style="margin-top:8px"><audio src="${getPublicUrlForPath(r.aud_url)}" controls class="preview"></audio></div>`;

      let ratingHtml = '';
      if (r.status === 'Resolved' && !r.rating) {
        ratingHtml = `
          <div style="margin-top:10px;">
            <p class="small">Rate the resolution:</p>
            <div class="rating-stars" style="font-size:24px; cursor:pointer; color:#ffc107;">
              <span onclick="submitRating('${r.id}', 1)">★</span>
              <span onclick="submitRating('${r.id}', 2)">★</span>
              <span onclick="submitRating('${r.id}', 3)">★</span>
              <span onclick="submitRating('${r.id}', 4)">★</span>
              <span onclick="submitRating('${r.id}', 5)">★</span>
            </div>
          </div>`;
      } else if (r.rating) {
        ratingHtml = `<p class="small" style="margin-top:10px;">You rated: ${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</p>`;
      }

      const inner = `
        <div class="report">
          <p><b>${escapeHtml(r.cat)}</b> - ${escapeHtml(r.desc)}</p>
          <p class="small"> ${escapeHtml(r.location || '')}</p>
          ${mediaHtml}
          <p class="small">${translations[currentLang].statusLabel}: <b>${escapeHtml(translations[currentLang][`status${r.status.replace(/\s/g, '')}`])}</b></p>
          ${ratingHtml}
        </div>`;
      reportsList.innerHTML += inner;
    }
  } catch(e){
    console.error(e);
    reportsList.innerHTML = `<p class="small error">${translations[currentLang].failedToLoadReports}</p>`;
  }
}
      
async function renderAllReports() {
    const reportsList = document.getElementById('allReports');
    reportsList.innerHTML = `<p class="small">${translations[currentLang].loadingMessage}</p>`;
    try {
        let { data: rows, error } = await supabaseClient.from('reports').select('*');
        if (error) throw error;
        
        const filterBy = document.getElementById('filterAdminReports').value;
        if (filterBy !== 'all') {
            rows = rows.filter(r => r.status === filterBy);
        }

        const sortBy = document.getElementById('sortAdminReports').value;
        const priorityOrder = { "Electricity": 1, "Water": 1, "Sanitation": 2, "Road": 3, "Streetlight": 3 };
        
        if (sortBy === 'priority') {
            rows.sort((a, b) => {
                const priorityA = priorityOrder[a.cat] || 99;
                const priorityB = priorityOrder[b.cat] || 99;
                if (priorityA !== priorityB) {
                    return priorityA - priorityB;
                }
                return new Date(b.created_at) - new Date(a.created_at);
            });
        } else if (sortBy === 'dateDesc') {
            rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } else if (sortBy === 'status') {
            rows.sort((a, b) => a.status.localeCompare(b.status));
        } else if (sortBy === 'category') {
            rows.sort((a, b) => a.cat.localeCompare(b.cat));
        }

        if (rows.length === 0) {
            reportsList.innerHTML = `<p class="small">No reports match the selected criteria.</p>`;
            return;
        }

        let allReportsHtml = '';
        for (const r of rows) {
            let mediaHtml = '<div style="display:flex; gap:10px; flex-wrap:wrap;">';
            if (r.img_url) mediaHtml += `<div><p class="small"><b>Before:</b></p><img src="${getPublicUrlForPath(r.img_url)}" class="preview" style="max-height:150px;"></div>`;
            if (r.resolution_image_url) {
                mediaHtml += `<div><p class="small"><b>After (Proof):</b></p><img src="${getPublicUrlForPath(r.resolution_image_url)}" class="preview" style="max-height:150px;"></div>`;
            }
            mediaHtml += '</div>';
            if (r.vid_url) mediaHtml += `<div style="margin-top:8px"><video src="${getPublicUrlForPath(r.vid_url)}" controls class="preview" style="max-height:150px;"></video></div>`;
            if (r.aud_url) mediaHtml += `<div style="margin-top:8px"><audio src="${getPublicUrlForPath(r.aud_url)}" controls class="preview"></audio></div>`;

            const proofUploadHtml = `
              <div class="upload-row" style="margin-top:10px;">
                <input type="file" id="proofUpload-${r.id}" accept="image/*" style="width:auto; flex-grow:1;">
                <button class="btn" style="width:auto;" onclick="uploadResolutionImage('${r.id}')">Upload Proof</button>
              </div>
            `;
            const priorityClass = priorityOrder[r.cat] === 1 ? 'high' : priorityOrder[r.cat] === 2 ? 'medium' : 'low';
            const priorityText = priorityOrder[r.cat] === 1 ? 'High Priority' : priorityOrder[r.cat] === 2 ? 'Medium Priority' : 'Low Priority';

            const inner = `
                <div class="report">
                    <span class="priority-tag ${priorityClass}">${priorityText}</span>
                    <p><b>${escapeHtml(r.cat)}</b> - ${escapeHtml(r.desc)}</p>
                    <p class="small">Location: ${escapeHtml(r.location || 'N/A')}</p>
                    ${r.lat && r.lng ? `<div id="map-${r.id}" class="map-container" style="height: 200px; z-index: 0;"></div>` : ''}
                    ${mediaHtml}
                    ${proofUploadHtml}
                    <p class="small" style="margin-top:10px;">${translations[currentLang].statusLabel}: <b>${escapeHtml(translations[currentLang][`status${r.status.replace(/\s/g, '')}`])}</b></p>
                    <div class="controls" style="margin-top:8px; flex-wrap:wrap;">
                        <button class="btn" style="background-color: #28a745;" onclick="adminUpdate('${r.id}','Accepted')">${translations[currentLang].acceptBtn}</button>
                        <button class="btn" style="background-color: #ffc107; color: #333;" onclick="adminUpdate('${r.id}','In Progress')">${translations[currentLang].inProgressBtn}</button>
                        <button class="btn" style="background-color: #17a2b8;" onclick="adminUpdate('${r.id}','Resolved')">${translations[currentLang].resolvedBtn}</button>
                        <button class="btn btn-danger" onclick="adminDelete('${r.id}','${r.img_url || ''}','${r.vid_url || ''}','${r.aud_url || ''}')">${translations[currentLang].deleteBtn}</button>
                    </div>
                </div>`;
            allReportsHtml += inner;
        }
        reportsList.innerHTML = allReportsHtml;
        for (const r of rows) {
            if (r.lat && r.lng) {
                const reportMap = L.map(`map-${r.id}`, { scrollWheelZoom: false, dragging: false, zoomControl: false }).setView([r.lat, r.lng], 16);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(reportMap);
                L.marker([r.lat, r.lng]).addTo(reportMap);
            }
        }
    } catch (e) {
        console.error(e);
        reportsList.innerHTML = `<p class="small error">${translations[currentLang].failedToLoadReports}</p>`;
    }
}
                  
async function adminUpdate(reportId,status){
  try {
    const { error } = await supabaseClient.from('reports').update({ status }).eq('id', reportId);
    if (error) throw error;
    showStatusMessage('Report updated successfully!', 'success');
    renderAllReports(); updateCharts();
  } catch(e) {
    showStatusMessage(translations[currentLang].updateFailedAlert + (e.message || e), 'error');
  }
}

async function uploadResolutionImage(reportId) {
    const fileInput = document.getElementById(`proofUpload-${reportId}`);
    const file = fileInput.files[0];

    if (!file) {
        showStatusMessage("Please select an image file to upload.", 'error');
        return;
    }

    try {
        const filePath = `resolutions/${reportId}/${Date.now()}_${file.name}`;
        await uploadFileToBucket(filePath, file);

        const { error } = await supabaseClient
            .from('reports')
            .update({ resolution_image_url: filePath })
            .eq('id', reportId);

        if (error) throw error;

        showStatusMessage('Proof of work uploaded successfully!', 'success');
        renderAllReports();
    } catch (e) {
        showStatusMessage('File upload failed. Please try again.', 'error');
        console.error('Resolution image upload failed:', e);
    }
}

async function adminDelete(reportId, imgPath, vidPath, audPath){
  if(!confirm(translations[currentLang].deleteConfirmation)) return;
  try {
    const pathsToRemove = [];
    if(imgPath) pathsToRemove.push(imgPath);
    if(vidPath) pathsToRemove.push(vidPath);
    if(audPath) pathsToRemove.push(audPath);
    if(pathsToRemove.length){
      const { error: rmErr } = await supabaseClient.storage.from('reports').remove(pathsToRemove);
      if(rmErr) console.warn('could not remove some files:', rmErr);
    }
    const { error } = await supabaseClient.from('reports').delete().eq('id', reportId);
    if(error) throw error;
    showStatusMessage('Report deleted successfully!', 'success');
    renderAllReports(); updateCharts();
  } catch(e){
    showStatusMessage(translations[currentLang].deleteFailedAlert + (e.message||e), 'error');
  }
}

let chartObj=null;
async function updateCharts(){
  try {
    const { data: rows, error } = await supabaseClient.from('reports').select('status');
    if(error) throw error;
    const counts={'Submitted':0,'Accepted':0,'In Progress':0,'Resolved':0};
    rows.forEach(r=>{ if(counts[r.status]!==undefined) counts[r.status]++; });
    const ctx=document.getElementById('statusChart').getContext('2d');
    const data={labels:Object.keys(counts).map(key => translations[currentLang][`status${key.replace(/\s/g, '')}`]),datasets:[{label:translations[currentLang].reportsCountLabel,data:Object.values(counts),backgroundColor:['#6c757d','#28a745','#ffc107','#17a2b8']}]};
    if(chartObj) chartObj.destroy();
    chartObj=new Chart(ctx,{type:'bar',data:data,options:{responsive:true, plugins:{legend:{display:false}}, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }}});
  } catch(e){ console.error('charts', e); }
}

async function logoutUser(){ await supabaseClient.auth.signOut(); localStorage.removeItem('civic_current_user'); localStorage.removeItem('civic_user_id'); currentUserEmail=null; currentUserId=null; gotoPage('userLogin'); }

function escapeHtml(str){ return (str||'').toString().replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

const translations = {
  en: {
    portalTitle: 'Civic Portal',
    roleQuestion: ' Who are you?',
    roleInstruction: 'Choose role to continue',
    userButton: 'I am a User',
    adminButton: 'I am an Admin',
    userLoginTitle: ' Sign in with Google',
    userLoginInstruction: "After signing in you'll be taken to the user portal",
    backButton: '← Back',
    adminLoginTitle: ' Admin Login',
    adminIdPlaceholder: 'Admin ID',
    adminPassPlaceholder: 'Password',
    loginButton: 'Login',
    cancelButton: 'Cancel',
    adminLoginError: ' Incorrect ID or Password',
    reportIssueTitle: ' Report an Issue',
    issueDescPlaceholder: 'Describe the issue...',
    selectCategoryPlaceholder: 'Select category',
    catElectricity: 'Electricity',
    catWater: 'Water',
    catStreetlight: 'Streetlight',
    catRoad: 'Road',
    catSanitation: 'Sanitation',
    locationLabel: ' Problem location',
    locationPlaceholder: 'Pin on the map to enter location',
    searchLocationBtn: 'Search',
    imageLabel: ' Image (upload or capture)',
    startCamBtn: 'Start Camera',
    removeImageBtn: 'Remove Image',
    takePhotoBtn: 'Take Photo',
    stopCamBtn: 'Stop Camera',
    videoLabel: ' Video (upload or record)',
    startVidRec: 'Start Recording',
    stopVidRec: 'Stop Recording',
    removeVidBtn: 'Remove Video',
    audioLabel: ' Audio (upload or record)',
    startAudRec: 'Start Recording',
    stopAudRec: 'Stop Recording',
    removeAudBtn: 'Remove Audio',
    submitReportBtn: 'Submit Report',
    logoutBtn: 'Logout',
    reportSuccessMsg: ' Report submitted successfully!',
    myReportsTitle: ' My Reports',
    adminDashboardTitle: ' Admin Dashboard',
    analyticsTitle: ' Analytics',
    backToRoleBtn: 'Back to Role Select',
    loadingMessage: 'Loading...',
    signInToViewReports: 'Sign in to see your reports',
    statusLabel: 'Status',
    acceptBtn: 'Accept',
    inProgressBtn: 'In Progress',
    resolvedBtn: 'Resolved',
    deleteBtn: 'Delete',
    deleteConfirmation: 'Are you sure you want to delete this report?',
    reportsCountLabel: 'Reports Count',
    signInFailedAlert: 'Google sign-in failed.',
    signInErrorAlert: 'Sign-in error',
    cameraErrorAlert: 'Could not access camera. Please check permissions.',
    videoRecorderErrorAlert: 'Could not access camera/microphone. Please check permissions.',
    audioRecorderErrorAlert: 'Could not access microphone. Please check permissions.',
    signInFirstAlert: 'You must be signed in to submit a report.',
    fillRequiredFieldsAlert: 'Please fill in the description, category, and location.',
    imageUploadFailedAlert: 'Image upload failed: ',
    videoUploadFailedAlert: 'Video upload failed: ',
    audioUploadFailedAlert: 'Audio upload failed: ',
    saveReportFailedAlert: 'Could not save report: ',
    failedToLoadReports: 'Failed to load reports.',
    updateFailedAlert: 'Update failed: ',
    deleteFailedAlert: 'Delete failed: ',
    statusSubmitted: 'Submitted',
    statusAccepted: 'Accepted',
    statusInProgress: 'In Progress',
    statusResolved: 'Resolved'
  },
  hi: {
    portalTitle: 'नागरिक पोर्टल',
    roleQuestion: ' आप कौन हैं?',
    roleInstruction: 'जारी रखने के लिए भूमिका चुनें',
    userButton: 'मैं एक उपयोगकर्ता हूँ',
    adminButton: 'मैं एक प्रशासक हूँ',
    userLoginTitle: ' गूगल से साइन इन करें',
    userLoginInstruction: 'साइन इन करने के बाद आपको उपयोगकर्ता पोर्टल पर ले जाया जाएगा',
    backButton: '← पीछे',
    adminLoginTitle: ' प्रशासक लॉगिन',
    adminIdPlaceholder: 'प्रशासक आईडी',
    adminPassPlaceholder: 'पासवर्ड',
    loginButton: 'लॉगिन',
    cancelButton: 'रद्द करें',
    adminLoginError: ' गलत आईडी या पासवर्ड',
    reportIssueTitle: ' एक समस्या की रिपोर्ट करें',
    issueDescPlaceholder: 'समस्या का वर्णन करें...',
    selectCategoryPlaceholder: 'श्रेणी चुनें',
    catElectricity: 'बिजली',
    catWater: 'पानी',
    catStreetlight: 'स्ट्रीटलाइट',
    catRoad: 'सड़क',
    catSanitation: 'स्वच्छता',
    locationLabel: ' समस्या का स्थान',
    locationPlaceholder: 'स्थान दर्ज करने के लिए मानचित्र पर पिन करें',
    searchLocationBtn: 'खोजें',
    imageLabel: ' छवि (अपलोड या कैप्चर करें)',
    startCamBtn: 'कैमरा शुरू करें',
    removeImageBtn: 'छवि हटाएँ',
    takePhotoBtn: 'फ़ोटो लें',
    stopCamBtn: 'कैमरा बंद करें',
    videoLabel: ' वीडियो (अपलोड या रिकॉर्ड करें)',
    startVidRec: 'रिकॉर्डिंग शुरू करें',
    stopVidRec: 'रिकॉर्डिंग बंद करें',
    removeVidBtn: 'वीडियो हटाएँ',
    audioLabel: ' ऑडिओ (अपलोड या रिकॉर्ड करें)',
    startAudRec: 'रिकॉर्डिंग शुरू करें',
    stopAudRec: 'रिकॉर्डिंग बंद करें',
    removeAudBtn: 'ऑडिओ हटाएँ',
    submitReportBtn: 'रिपोर्ट सबमिट करें',
    logoutBtn: 'लॉगआउट',
    reportSuccessMsg: ' रिपोर्ट सफलतापूर्वक सबमिट हो गई!',
    myReportsTitle: ' मेरी रिपोर्टें',
    adminDashboardTitle: ' व्यवस्थापक डैशबोर्ड',
    analyticsTitle: ' विश्लेषण',
    backToRoleBtn: 'भूमिका चयन पर वापस जाएँ',
    loadingMessage: 'लोड हो रहा है...',
    signInToViewReports: 'अपनी रिपोर्ट देखने के लिए साइन इन करें',
    statusLabel: 'स्थिति',
    acceptBtn: 'स्वीकार करें',
    inProgressBtn: 'प्रगती में है',
    resolvedBtn: 'हल हो गया',
    deleteBtn: 'हटाएँ',
    deleteConfirmation: 'क्या आप वाकई इस रिपोर्ट को हटाना चाहते हैं?',
    reportsCountLabel: 'रिपोर्टों की संख्या',
    signInFailedAlert: 'गूगल साइन-इन विफल।',
    signInErrorAlert: 'साइन-इन त्रुटि',
    cameraErrorAlert: 'कैमरा तक नहीं पहुँचा जा सका। कृपया अनुमतियाँ जाँचें।',
    videoRecorderErrorAlert: 'कैमरा/माइक्रोफोन तक नहीं पहुँचा जा सका। कृपया अनुमतियाँ जाँचें।',
    audioRecorderErrorAlert: 'माइक्रोफोन तक नहीं पहुँचा जा सका। कृपया अनुमतियाँ जाँचें।',
    signInFirstAlert: 'रिपोर्ट सबमिट करने के लिए आपको साइन इन करना होगा।',
    fillRequiredFieldsAlert: 'कृपया विवरण, श्रेणी और स्थान भरें।',
    imageUploadFailedAlert: 'छवि अपलोड विफल: ',
    videoUploadFailedAlert: 'वीडियो अपलोड विफल: ',
    audioUploadFailedAlert: 'ऑडिओ अपलोड विफल: ',
    saveReportFailedAlert: 'रिपोर्ट सहेजी नहीं जा सकी: ',
    failedToLoadReports: 'रिपोर्ट लोड करने में विफल रहा।',
    updateFailedAlert: 'अपडेट विफल: ',
    deleteFailedAlert: 'हटाने में विफल: ',
    statusSubmitted: 'प्रस्तुत',
    statusAccepted: 'स्वीकृत',
    statusInProgress: 'प्रगति में',
    statusResolved: 'हल किया गया'
  },
  mr: {
    portalTitle: 'नागरिक पोर्टल',
    roleQuestion: ' तुम्ही कोण आहात?',
    roleInstruction: 'पुढे जाण्यासाठी भूमिका निवडा',
    userButton: 'मी वापरकर्ता आहे',
    adminButton: 'मी प्रशासक आहे',
    userLoginTitle: ' Google सह साइन इन करा',
    userLoginInstruction: 'साइन इन केल्यानंतर तुम्हाला वापरकर्ता पोर्टलवर नेले जाईल',
    backButton: '← मागे',
    adminLoginTitle: ' ॲडमिन लॉगिन',
    adminIdPlaceholder: 'ॲडमिन आयडी',
    adminPassPlaceholder: 'पासवर्ड',
    loginButton: 'लॉगिन',
    cancelButton: 'रद्द करा',
    adminLoginError: ' चुकीचा आयडी किंवा पासवर्ड',
    reportIssueTitle: ' समस्या नोंदवा',
    issueDescPlaceholder: 'समस्येचे वर्णन करा...',
    selectCategoryPlaceholder: 'श्रेणी निवडा',
    catElectricity: 'वीज',
    catWater: 'पाणी',
    catStreetlight: 'स्ट्रीटलाइट',
    catRoad: 'रस्ता',
    catSanitation: 'स्वच्छता',
    locationLabel: ' समस्येचे स्थान',
    locationPlaceholder: 'स्थान प्रविष्ट करण्यासाठी नकाशावर पिन करा',
    searchLocationBtn: 'शोधा',
    imageLabel: ' प्रतिमा (अपलोड किंवा कॅप्चर करा)',
    startCamBtn: 'कॅमेरा सुरू करा',
    removeImageBtn: 'प्रतिमा काढा',
    takePhotoBtn: 'फोटो घ्या',
    stopCamBtn: 'कॅमेरा बंद करा',
    videoLabel: ' व्हिडिओ (अपलोड किंवा रेकॉर्ड करा)',
    startVidRec: 'रेकॉर्डिंग सुरू करा',
    stopVidRec: 'रेकॉर्डिंग बंद करा',
    removeVidBtn: 'व्हिडिओ काढा',
    audioLabel: ' ऑडिओ (अपलोड किंवा रेकॉर्ड करा)',
    startAudRec: 'रेकॉर्डिंग सुरू करा',
    stopAudRec: 'रेकॉर्डिंग बंद करा',
    removeAudBtn: 'ऑडिओ काढा',
    submitReportBtn: 'रिपोर्ट सबमिट करा',
    logoutBtn: 'लॉगआउट',
    reportSuccessMsg: ' रिपोर्ट यशस्वीरित्या सबमिट झाली!',
    myReportsTitle: ' माझ्या रिपोर्ट',
    adminDashboardTitle: ' ॲडमिन डॅशबोर्ड',
    analyticsTitle: ' विश्लेषण',
    backToRoleBtn: 'भूमिका निवडीवर परत जा',
    loadingMessage: 'लोड होत आहे...',
    signInToViewReports: 'तुमच्या रिपोर्ट पाहण्यासाठी साइन इन करा',
    statusLabel: 'स्थिती',
    acceptBtn: 'स्वीकारा',
    inProgressBtn: 'प्रगतीत आहे',
    resolvedBtn: 'सोडवले',
    deleteBtn: 'काढा',
    deleteConfirmation: 'तुम्हाला खात्री आहे की ही रिपोर्ट काढायची आहे?',
    reportsCountLabel: 'रिपोर्टची संख्या',
    signInFailedAlert: 'Google साइन-इन अयशस्वी.',
    signInErrorAlert: 'साइन-इन त्रुटी',
    cameraErrorAlert: 'कॅमेऱ्यात प्रवेश करता आला नाही. कृपया परवानग्या तपासा.',
    videoRecorderErrorAlert: 'कॅमेरा/मायक्रोफोनमध्ये प्रवेश करता आला नाही. कृपया परवानग्या तपासा.',
    audioRecorderErrorAlert: 'मायक्रोफोनमध्ये प्रवेश करता आला नाही. कृपया परवानग्या तपासा.',
    signInFirstAlert: 'रिपोर्ट सबमिट करण्यासाठी तुम्ही साइन इन केलेले असणे आवश्यक आहे.',
    fillRequiredFieldsAlert: 'कृपया वर्णन, श्रेणी आणि स्थान भरा.',
    imageUploadFailedAlert: 'प्रतिमा अपलोड अयशस्वी: ',
    videoUploadFailedAlert: 'व्हिडिओ अपलोड अयशस्वी: ',
    audioUploadFailedAlert: 'ऑडिओ अपलोड अयशस्वी: ',
    saveReportFailedAlert: 'रिपोर्ट सेव्ह करू शकलो नाही: ',
    failedToLoadReports: 'रिपोर्ट लोड करण्यात अयशस्वी.',
    updateFailedAlert: 'अपडेट अयशस्वी: ',
    deleteFailedAlert: 'काढणे अयशस्वी: ',
    statusSubmitted: 'सबमिट केले',
    statusAccepted: 'स्वीकृत',
    statusInProgress: 'प्रगतीत',
    statusResolved: 'सोडवले'
  },
  or: {
    portalTitle: 'ସିଭିକ୍ ପୋର୍ଟାଲ୍',
    roleQuestion: ' ଆପଣ କିଏ?',
    roleInstruction: 'ଜାରି ରଖିବାକୁ ଭୂମିକା ବାଛନ୍ତୁ',
    userButton: 'ମୁଁ ଜଣେ ଉପଭୋକ୍ତା',
    adminButton: 'ମୁଁ ଜଣେ ଆଡମିନ୍',
    userLoginTitle: ' ଗୁଗୁଲ୍ ସହିତ ସାଇନ୍ ଇନ୍ କରନ୍ତୁ',
    userLoginInstruction: 'ସାଇନ୍ ଇନ୍ କରିବା ପରେ ଆପଣଙ୍କୁ ଉପଭୋକ୍ତା ପୋର୍ଟାଲ୍ କୁ ନିଆଯିବ',
    backButton: '← ପଛକୁ',
    adminLoginTitle: ' ଆଡମିନ୍ ଲଗ୍ ଇନ୍',
    adminIdPlaceholder: 'ଆଡମିନ୍ ID',
    adminPassPlaceholder: 'ପାସୱାର୍ଡ',
    loginButton: 'ଲଗ୍ ଇନ୍',
    cancelButton: 'ବାତିଲ୍',
    adminLoginError: ' ଭୁଲ୍ ID କିମ୍ବା ପାସୱାର୍ଡ',
    reportIssueTitle: ' ଏକ ସମସ୍ୟା ରିପୋର୍ଟ କରନ୍ତୁ',
    issueDescPlaceholder: 'ସମସ୍ୟା ବର୍ଣ୍ଣନା କରନ୍ତୁ...',
    selectCategoryPlaceholder: 'ବର୍ଗ ବାଛନ୍ତୁ',
    catElectricity: 'ବିଦ୍ୟୁତ୍',
    catWater: 'ପାଣି',
    catStreetlight: 'ଷ୍ଟ୍ରିଟଲାଇଟ୍',
    catRoad: 'ରାସ୍ତା',
    catSanitation: 'ସ୍ୱଚ୍ଛତା',
    locationLabel: ' ସମସ୍ୟା ସ୍ଥାନ',
    locationPlaceholder: 'ସ୍ଥାନ ଦେବା ପାଇଁ ମାନଚିତ୍ର ରେ ପିନ୍ କରନ୍ତୁ',
    searchLocationBtn: 'ଖୋଜନ୍ତୁ',
    imageLabel: ' ଛବି (ଅପଲୋଡ୍ କିମ୍ବା କ୍ୟାପଚର୍)',
    startCamBtn: 'କ୍ୟାମେରା ଆରମ୍ଭ କରନ୍ତୁ',
    removeImageBtn: 'ଛବି ହଟାନ୍ତୁ',
    takePhotoBtn: 'ଫଟୋ ନିଅନ୍ତୁ',
    stopCamBtn: 'କ୍ୟାମେରା ବନ୍ଦ କରନ୍ତୁ',
    videoLabel: ' ଭିଡିଓ (ଅପଲୋଡ୍ କିମ୍ବା ରେକର୍ଡ)',
    startVidRec: 'ରେକର୍ଡିଂ ଆରମ୍ଭ କରନ୍ତୁ',
    stopVidRec: 'ରେକର୍ଡିଂ ବନ୍ଦ କରନ୍ତୁ',
    removeVidBtn: 'ଭିଡିଓ ହଟାନ୍ତୁ',
    audioLabel: ' ଅଡିଓ (ଅପଲୋଡ୍ କିମ୍ବା ରେକର୍ଡ)',
    startAudRec: 'ରେକର୍ଡିଂ ଆରମ୍ଭ କରନ୍ତୁ',
    stopAudRec: 'ରେକର୍ଡିଂ ବନ୍ଦ କରନ୍ତୁ',
    removeAudBtn: 'ଅଡିଓ ହଟାନ୍ତୁ',
    submitReportBtn: 'ରିପୋର୍ଟ ଦାଖଲ କରନ୍ତୁ',
    logoutBtn: 'ଲଗ୍ ଆଉଟ୍',
    reportSuccessMsg: ' ରିପୋର୍ଟ ସଫଳତାର ସହିତ ଦାଖଲ ହୋଇଛି!',
    myReportsTitle: ' ମୋର ରିପୋର୍ଟଗୁଡ଼ିକ',
    adminDashboardTitle: ' ଆଡମିନ୍ ଡ୍ୟାସବୋର୍ଡ',
    analyticsTitle: ' ବିଶ୍ଳେଷଣ',
    backToRoleBtn: 'ଭୂମିକା ଚୟନକୁ ଫେରନ୍ତୁ',
    loadingMessage: 'ଲୋଡ୍ ହେଉଛି...',
    signInToViewReports: 'ଆପଣଙ୍କ ରିପୋର୍ଟଗୁଡ଼ିକ ଦେଖିବାକୁ ସାଇନ୍ ଇନ୍ କରନ୍ତୁ',
    statusLabel: 'ସ୍ଥିତି',
    acceptBtn: 'ଗ୍ରହଣ କରନ୍ତୁ',
    inProgressBtn: 'ପ୍ରଗତିରେ',
    resolvedBtn: 'ସମାଧାନ ହୋଇଛି',
    deleteBtn: 'ହଟାନ୍ତୁ',
    deleteConfirmation: 'ଆପଣ ଏହି ରିପୋର୍ଟକୁ ହଟାଇବାକୁ ନିଶ୍ଚିତ କି?',
    reportsCountLabel: 'ରିପୋର୍ଟଗୁଡ଼ିକର ସଂଖ୍ୟା',
    signInFailedAlert: 'ଗୁଗୁଲ୍ ସାଇନ୍ ଇନ୍ ବିଫଳ ହେଲା।',
    signInErrorAlert: 'ସାଇନ୍ ଇନ୍ ତ୍ରୁଟି',
    cameraErrorAlert: 'କ୍ୟାମେରାକୁ ପ୍ରବେଶ କରିପାରିଲୁ ନାହିଁ। ଦୟାକରି ଅନୁମତିଗୁଡ଼ିକୁ ଯାଞ୍ଚ କରନ୍ତୁ।',
    videoRecorderErrorAlert: 'କ୍ୟାମେରା/ମାଇକ୍ରୋଫୋନକୁ ପ୍ରବେଶ କରିପାରିଲୁ ନାହିଁ। ଦୟାକରି ଅନୁମତିଗୁଡ଼ିକୁ ଯାଞ୍ଚ କରନ୍ତୁ।',
    audioRecorderErrorAlert: 'ମାଇକ୍ରୋଫୋନକୁ ପ୍ରବେଶ କରିପାରିଲୁ ନାହିଁ। ଦୟାକରି ଅନୁମତିଗୁଡ଼ିକୁ ଯାଞ୍ଚ କରନ୍ତୁ।',
    signInFirstAlert: 'ରିପୋର୍ଟ ଦାଖଲ କରିବା ପାଇଁ ଆପଣ ସାଇନ୍ ଇନ୍ କରିବା ଜରୁରୀ।',
    fillRequiredFieldsAlert: 'ଦୟାକରି ବର୍ଣ୍ଣନା, ବର୍ଗ ଏବଂ ସ୍ଥାନ ଭରନ୍ତୁ।',
    imageUploadFailedAlert: 'ଛବି ଅପଲୋଡ୍ ବିଫଳ ହେଲା: ',
    videoUploadFailedAlert: 'ଭିଡିଓ ଅପଲୋଡ୍ ବିଫଳ ହେଲା: ',
    audioUploadFailedAlert: 'ଅଡିଓ ଅପଲୋଡ୍ ବିଫଳ ହେଲା: ',
    saveReportFailedAlert: 'ରିପୋର୍ଟ ସେଭ୍ କରିପାରିଲୁ ନାହିଁ: ',
    failedToLoadReports: 'ରିପୋର୍ଟଗୁଡ଼ିକ ଲୋଡ୍ କରିବାରେ ବିଫଳ ହେଲା।',
    updateFailedAlert: 'ଅପଡେଟ୍ ବିଫଳ ହେଲା: ',
    deleteFailedAlert: 'ହଟାଇବା ବିଫଳ ହେଲା: ',
    statusSubmitted: 'ଦାଖଲ ହୋଇଛି',
    statusAccepted: 'ଗ୍ରହଣ କରାଯାଇଛି',
    statusInProgress: 'ପ୍ରଗତିରେ',
    statusResolved: 'ସମାଧାନ ହୋଇଛି'
},
ur: {
    portalTitle: 'سوِک پورٹل',
    roleQuestion: ' آپ کون ہیں؟',
    roleInstruction: 'جاری رکھنے کے لیے کردار منتخب کریں',
    userButton: 'میں ایک صارف ہوں',
    adminButton: 'میں ایک ایڈمن ہوں',
    userLoginTitle: ' گوگل کے ساتھ سائن ان کریں',
    userLoginInstruction: 'سائن ان کرنے کے بعد آپ کو صارف پورٹل پر لے جایا جائے گا',
    backButton: '← پیچھے',
    adminLoginTitle: ' ایڈمن لاگ ان',
    adminIdPlaceholder: 'ایڈمن ID',
    adminPassPlaceholder: 'پاس ورڈ',
    loginButton: 'لاگ ان',
    cancelButton: 'منسوخ کریں',
    adminLoginError: ' غلط ID یا پاس ورڈ',
    reportIssueTitle: ' ایک مسئلہ رپورٹ کریں',
    issueDescPlaceholder: 'مسئلہ کی تفصیل...',
    selectCategoryPlaceholder: 'زمرہ منتخب کریں',
    catElectricity: 'بجلی',
    catWater: 'پانی',
    catStreetlight: 'اسٹریٹ لائٹ',
    catRoad: 'سڑک',
    catSanitation: 'صفائی',
    locationLabel: ' مسئلہ کا مقام',
    locationPlaceholder: 'مقام درج کرنے کے لیے نقشہ پر پن کریں',
    searchLocationBtn: 'تلاش کریں',
    imageLabel: ' تصویر (اپ لوڈ یا کیپچر)',
    startCamBtn: 'کیمرہ شروع کریں',
    removeImageBtn: 'تصویر ہٹائیں',
    takePhotoBtn: 'تصویر لیں',
    stopCamBtn: 'کیمرہ بند کریں',
    videoLabel: ' ویڈیو (اپ لوڈ یا ریکارڈ)',
    startVidRec: 'ریکارڈنگ شروع کریں',
    stopVidRec: 'ریکارڈنگ بند کریں',
    removeVidBtn: 'ویڈیو ہٹائیں',
    audioLabel: ' آڈیو (اپ لوڈ یا ریکارڈ)',
    startAudRec: 'ریکارڈنگ شروع کریں',
    stopAudRec: 'ریکارڈنگ بند کریں',
    removeAudBtn: 'آڈیو ہٹائیں',
    submitReportBtn: 'رپورٹ جمع کریں',
    logoutBtn: 'لاگ آؤٹ',
    reportSuccessMsg: ' رپورٹ کامیابی سے جمع ہو گئی ہے!',
    myReportsTitle: ' میری رپورٹس',
    adminDashboardTitle: ' ایڈمن ڈیش بورڈ',
    analyticsTitle: ' تجزیات',
    backToRoleBtn: 'کردار کے انتخاب پر واپس جائیں',
    loadingMessage: 'لوڈ ہو رہا ہے...',
    signInToViewReports: 'اپنی رپورٹس دیکھنے کے لیے سائن ان کریں',
    statusLabel: 'حیثیت',
    acceptBtn: 'قبول کریں',
    inProgressBtn: 'ترقی میں ہے',
    resolvedBtn: 'حل ہو گیا',
    deleteBtn: 'حذف کریں',
    deleteConfirmation: 'کیا آپ واقعی اس رپورٹ کو حذف کرنا چاہتے ہیں؟',
    reportsCountLabel: 'رپورٹس کی گنتی',
    signInFailedAlert: 'گوگل سائن ان ناکام ہو گیا۔',
    signInErrorAlert: 'سائن ان کی خرابی',
    cameraErrorAlert: 'کیمرہ تک رسائی نہیں ہو سکی۔ براہ کرم اجازتیں چیک کریں۔',
    videoRecorderErrorAlert: 'کیمرہ/مائیکروفون تک رسائی نہیں ہو سکی۔ براہ کرم اجازتیں چیک کریں۔',
    audioRecorderErrorAlert: 'مائیکروفون تک رسائی نہیں ہو سکی۔ براہ کرم اجازتیں چیک کریں۔',
    signInFirstAlert: 'رپورٹ جمع کرنے کے لیے آپ کو سائن ان کرنا ضروری ہے۔',
    fillRequiredFieldsAlert: 'براہ کرم تفصیل، زمرہ اور مقام پُر کریں۔',
    imageUploadFailedAlert: 'تصویر اپ لوڈ ناکام: ',
    videoUploadFailedAlert: 'ویڈیو اپ لوڈ ناکام: ',
    audioUploadFailedAlert: 'آڈیو اپ لوڈ ناکام: ',
    saveReportFailedAlert: 'رپورٹ محفوظ نہیں ہو سکی: ',
    failedToLoadReports: 'رپورٹس لوڈ کرنے میں ناکام رہا۔',
    updateFailedAlert: 'اپ ڈیٹ ناکام: ',
    deleteFailedAlert: 'حذف ناکام: ',
    statusSubmitted: 'جمع شدہ',
    statusAccepted: 'منظور شدہ',
    statusInProgress: 'ترقی میں',
    statusResolved: 'حل شدہ'
}
};

let currentLang = 'en';

function setLanguage(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-lang]').forEach(element => {
    const key = element.getAttribute('data-lang');
    if (translations[lang] && translations[lang][key]) {
      element.textContent = translations[lang][key];
    }
  });
  document.querySelectorAll('[data-lang-placeholder]').forEach(element => {
    const key = element.getAttribute('data-lang-placeholder');
    if (translations[lang] && translations[lang][key]) {
      element.placeholder = translations[lang][key];
    }
  });
  const categorySelect = document.getElementById('issueCat');
  const categoryOptions = categorySelect.getElementsByTagName('option');
  for (let i = 1; i < categoryOptions.length; i++) {
    const optionKey = categoryOptions[i].getAttribute('data-lang');
    if (translations[lang] && translations[lang][optionKey]) {
        categoryOptions[i].textContent = translations[lang][optionKey];
    }
  }
  if (!document.getElementById('page3').classList.contains('hidden')) renderUserReports();
  if (!document.getElementById('page4').classList.contains('hidden')) { renderAllReports(); updateCharts(); }
}

function toggleTheme() {
    const body = document.body;
    body.classList.toggle('dark-theme');
    const themeToggleBtn = document.getElementById('themeToggle');
    const isDark = body.classList.contains('dark-theme');
    themeToggleBtn.textContent = isDark ? '🌙' : '☀️';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// Check for saved theme preference on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        document.getElementById('themeToggle').textContent = '🌙';
    } else {
        document.body.classList.remove('dark-theme');
        document.getElementById('themeToggle').textContent = '☀️';
    }
});

setLanguage(currentLang);