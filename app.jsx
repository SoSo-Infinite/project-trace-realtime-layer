import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

// --- Global Setup (Mandatory Canvas Variables) ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Helper function to get the current collection path for public data
const getPublicCollectionPath = (appId) => `/artifacts/${appId}/public/data/todos`;

const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [todos, setTodos] = useState([]);
  const [newTaskText, setNewTaskText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // 1. Initialize Firebase and Handle Authentication
  useEffect(() => {
    if (!firebaseConfig) {
      setError('Firebase configuration is missing.');
      setIsLoading(false);
      return;
    }

    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);
      
      setDb(firestore);
      setAuth(firebaseAuth);

      const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
        if (!user) {
          // Attempt custom token sign-in or fall back to anonymous
          try {
            if (initialAuthToken) {
              const userCredential = await signInWithCustomToken(firebaseAuth, initialAuthToken);
              setUserId(userCredential.user.uid);
            } else {
              const userCredential = await signInAnonymously(firebaseAuth);
              setUserId(userCredential.user.uid);
            }
          } catch (e) {
            console.error('Authentication Error:', e);
            setError('Failed to sign in. Check console for details.');
          }
        } else {
          setUserId(user.uid);
        }
        setIsAuthReady(true);
        setIsLoading(false);
      });

      return () => unsubscribeAuth();
    } catch (e) {
      console.error('Firebase Initialization Error:', e);
      setError('Failed to initialize Firebase.');
      setIsLoading(false);
    }
  }, []);

  // 2. Real-Time Data Listener (Firestore) - Demonstrating TRACE capability
  useEffect(() => {
    // Only proceed once auth is ready and we have a database instance
    if (!isAuthReady || !db) return;

    try {
      const todosRef = collection(db, getPublicCollectionPath(appId));
      // Note: We avoid Firestore orderBy for complex queries, sorting client-side if needed.
      const q = query(todosRef); 
      
      const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        const fetchedTodos = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
        // Client-side sort by timestamp (latest first)
        fetchedTodos.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        
        setTodos(fetchedTodos);
      }, (e) => {
        console.error("Firestore Snapshot Error:", e);
        setError("Failed to fetch tasks in real-time.");
      });

      return () => unsubscribeSnapshot();
    } catch (e) {
      console.error('Firestore Setup Error:', e);
      setError('Cannot set up real-time listener.');
    }
  }, [db, isAuthReady, appId]);


  // 3. CRUD Operations
  const handleAddTask = useCallback(async () => {
    if (!newTaskText.trim() || !db || !userId) return;
    
    try {
      await addDoc(collection(db, getPublicCollectionPath(appId)), {
        text: newTaskText.trim(),
        completed: false,
        userId: userId, // Track creator for access control
        createdAt: serverTimestamp(),
      });
      setNewTaskText('');
    } catch (e) {
      console.error('Add Task Error:', e);
      setError('Could not add task.');
    }
  }, [newTaskText, db, userId, appId]);

  const handleToggleTodo = useCallback(async (todo) => {
    if (!db) return;
    try {
      const todoRef = doc(db, getPublicCollectionPath(appId), todo.id);
      await updateDoc(todoRef, {
        completed: !todo.completed,
      });
    } catch (e) {
      console.error('Toggle Task Error:', e);
      setError('Could not update task status.');
    }
  }, [db, appId]);

  const handleDeleteTodo = useCallback(async (id) => {
    if (!db) return;
    try {
      const todoRef = doc(db, getPublicCollectionPath(appId), id);
      await deleteDoc(todoRef);
    } catch (e) {
      console.error('Delete Task Error:', e);
      setError('Could not delete task.');
    }
  }, [db, appId]);
  
  // 4. Render Logic
  const completedTodos = useMemo(() => todos.filter(t => t.completed), [todos]);
  const activeTodos = useMemo(() => todos.filter(t => !t.completed), [todos]);

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen bg-gray-50">
      <div className="text-xl font-semibold text-indigo-600">Initializing Distributed System...</div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8 font-sans antialiased">
      <script src="https://cdn.tailwindcss.com"></script>
      <div className="max-w-4xl mx-auto">
        <header className="py-6 mb-8 text-center border-b border-indigo-200">
          <h1 className="text-4xl font-extrabold text-indigo-700">
            Project TRACE: Real-Time Synchronization Layer
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            **Architectural ID:** <code className="bg-indigo-100 px-2 py-1 rounded text-indigo-600 font-mono text-xs">{appId}</code>
            <br/>
            **Current Client Session ID:** <code className="bg-indigo-100 px-2 py-1 rounded text-indigo-600 font-mono text-xs">{userId || 'N/A'}</code>
          </p>
        </header>

        {error && (
          <div className="p-4 mb-6 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-lg">
            <p className="font-bold">System Error:</p>
            <p>{error}</p>
          </div>
        )}

        {/* New Task Input */}
        <div className="mb-8 p-4 bg-white shadow-xl rounded-xl">
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">Command Input (Data Write)</h2>
          <div className="flex space-x-3">
            <input
              type="text"
              className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
              placeholder="Enter a task to inject into the data layer..."
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddTask()}
              aria-label="New Task Text"
            />
            <button
              onClick={handleAddTask}
              className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 transition duration-200 disabled:opacity-50"
              disabled={!newTaskText.trim()}
              aria-label="Add Task"
            >
              Execute Write
            </button>
          </div>
        </div>

        {/* Task Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Active Tasks */}
          <TaskList 
            title={`Active Workload (${activeTodos.length})`} 
            todos={activeTodos} 
            onToggle={handleToggleTodo} 
            onDelete={handleDeleteTodo} 
            userId={userId}
            color="indigo"
          />

          {/* Completed Tasks */}
          <TaskList 
            title={`Completed Commitments (${completedTodos.length})`} 
            todos={completedTodos} 
            onToggle={handleToggleTodo} 
            onDelete={handleDeleteTodo} 
            userId={userId}
            color="green"
          />

        </div>
      </div>
    </div>
  );
};

// TaskList Component
const TaskList = ({ title, todos, onToggle, onDelete, userId, color }) => (
  <section>
    <h2 className={`text-2xl font-bold mb-4 text-${color}-700 border-b-2 border-${color}-300 pb-2`}>
      {title}
    </h2>
    <div className="space-y-3">
      {todos.length === 0 ? (
        <p className="text-gray-500 p-4 bg-white rounded-lg shadow-sm">
          No data objects found in this state.
        </p>
      ) : (
        todos.map((todo) => (
          <TaskItem 
            key={todo.id} 
            todo={todo} 
            onToggle={onToggle} 
            onDelete={handleDeleteTodo} 
            isCreator={todo.userId === userId}
            color={color}
          />
        ))
      )}
    </div>
  </section>
);

// TaskItem Component
const TaskItem = ({ todo, onToggle, onDelete, isCreator, color }) => (
  <div className={`flex items-center p-4 bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-200 border-l-4 border-${color}-400`}>
    
    {/* Checkbox */}
    <input
      type="checkbox"
      checked={todo.completed}
      onChange={() => onToggle(todo)}
      className={`form-checkbox h-5 w-5 text-${color}-600 rounded border-gray-300 focus:ring-${color}-500 transition duration-150`}
      aria-label={`Toggle completion for ${todo.text}`}
    />
    
    {/* Text */}
    <span className={`ml-4 flex-grow text-lg ${todo.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
      {todo.text}
    </span>
    
    {/* Creator Indicator */}
    <span className={`text-xs px-2 py-1 rounded-full bg-${color}-100 text-${color}-600 font-medium ml-2 mr-4`}>
      {isCreator ? 'OWNER' : 'PEER NODE'}
    </span>

    {/* Delete Button (Only visible to the creator) */}
    {isCreator && (
      <button
        onClick={() => onDelete(todo.id)}
        className="text-red-500 hover:text-red-700 p-1 rounded-full transition duration-150"
        aria-label={`Delete task: ${todo.text}`}
      >
        {/* Trash icon */}
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
      </button>
    )}
  </div>
);

export default App;
