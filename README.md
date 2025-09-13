Civic Portal - Government of India
1. Project Overview
The Civic Portal is a web application designed to empower citizens of Patna to report local civic issues directly to the administration. This initiative by the Government of India, developed by "Team Civic Sparks," aims to create a transparent and efficient channel for addressing public grievances. The portal utilizes modern web technologies, including AI-powered features, to streamline the process of reporting, tracking, and resolving issues.

The application is fully responsive, supports multiple languages, and includes a dark mode for better accessibility.

2. Key Features
User-Facing Features
Secure Authentication: Easy and secure sign-in for users via their Google accounts.

Multi-Lingual Interface: Supports English, Hindi, Marathi, Odia, and Urdu.

Comprehensive Issue Reporting: Users can describe an issue, select a category, and pin the exact location on an interactive map.

Voice-to-Text Input: Users can dictate their issue description using their device's microphone.

Multimedia Uploads: Ability to upload or capture images, videos, and audio recordings as evidence.

Report Tracking: A personal dashboard for users to view their submitted reports and track their current status (Submitted, Accepted, In Progress, Resolved).

Feedback System: Users can rate the resolution of their reported issues.

Dark/Light Theme: Toggle between themes for user comfort.

Admin-Facing Features
Admin Dashboard: A centralized dashboard to view, manage, and track all user-submitted reports.

Advanced Filtering & Sorting: Admins can filter reports by status and sort them by priority, date, status, or category.

Priority System: Reports are automatically assigned a priority level (High, Medium, Low) based on their category.

AI-Powered Summary: Admins can listen to an AI-generated voice summary of the current reports.

Status Updates: Admins can update the status of any report, which is reflected in the user's dashboard.

Proof of Resolution: Admins can upload an image to show proof that an issue has been resolved.

Data Analytics: A bar chart visually represents the number of reports across different statuses.

3. Technology Stack
Frontend: HTML5, CSS3, Vanilla JavaScript (ES6+)

Backend as a Service (BaaS): Supabase

Authentication: Manages user sign-in via Google and admin login.

Database: PostgreSQL for storing all report data.

Storage: Manages uploads of images, videos, and audio files.

APIs & Libraries:

Mapping: Leaflet.js with OpenStreetMap for the interactive map.

Geocoding: Nominatim API for searching addresses on the map.

AI - Categorization: Google Generative AI (Gemini Pro) to automatically suggest an issue category based on the user's description.

Charts: Chart.js for the admin analytics dashboard.

Speech: Web Speech API (SpeechRecognition for voice input and SpeechSynthesis for the admin summary).

4. Setup and Local Installation
To run this project locally, follow these steps:

Clone the repository or download the files.

Place the Files: Ensure index.html, style.css, and script.js are in the same directory.

Configuration (Crucial): Open script.js and update the following placeholder constants with your own API keys and credentials:

Supabase Credentials:

const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

Google Generative AI API Key:

const API_KEY = 'YOUR_GEMINI_API_KEY'; 

Google Sign-In Client ID: In index.html, find the g_id_onload div and update data-client_id:

<div id="g_id_onload"
     data-client_id="YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"
     data-callback="handleCredentialResponse">
</div>

Run a Local Server: Open the index.html file using a local web server. A simple way to do this is with the "Live Server" extension in Visual Studio Code. Directly opening the HTML file from the file system may cause issues with API requests due to CORS policies.

5. Usage Guide
For Users
Navigate to the portal.

Select "I am a User".

Sign in using the "Sign in with Google" button.

Fill out the "Report an Issue" form. You can type, use the voice input button, and pin the location on the map.

Optionally, upload or capture media evidence.

Click "Submit Report".

View the status of your submissions under the "My Reports" section on the same page.

For Admins
Navigate to the portal.

Select "I am an Admin".

Enter the Admin ID (civic01) and the corresponding password configured in Supabase.

Use the filter and sort options to manage incoming reports.

Click the buttons on each report card to update its status or delete it.

Upload a "proof of resolution" image for resolved reports.

View the "Analytics" chart for an overview of report statuses.
