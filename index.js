import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import { getDatabase, ref, push, set, get} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js';

const firebaseConfig = {
  apiKey: "AIzaSyAmndWtX0CerpuRdAIZsh7h_Qu2qCzCZg0",
  authDomain: "ticket-site-test.firebaseapp.com",
  projectId: "ticket-site-test",
  storageBucket: "ticket-site-test.firebasestorage.app",
  messagingSenderId: "156026395018",
  appId: "1:156026395018:web:4a1ce6562bde83dbe25073",
   databaseURL: "https://ticket-site-test-default-rtdb.firebaseio.com/",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
window.app = app;
window.db = db;
window.ref = ref;
window.push = push;
window.set = set;
window.get = get;



                        
