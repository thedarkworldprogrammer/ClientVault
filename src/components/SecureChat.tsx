/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  getDocs,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from './AuthContext';
import { 
  Send, 
  MessageSquare, 
  Clock, 
  Trash2, 
  User, 
  Shield, 
  Loader2, 
  Check, 
  CheckCheck, 
  Search, 
  X, 
  AlertCircle,
  Inbox,
  ChevronRight,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChatMessage {
  id: string;
  senderId: string;
  senderEmail: string;
  text: string;
  timestamp: any;
  readByAdmin: boolean;
  readByClient: boolean;
}

interface FirestoreUser {
  id: string;
  email: string;
  name?: string;
  createdAt: Date | null;
}

export const SecureChat: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.uid === 'Od1XeGkGT2esKsPd6lJZ1x7KGzV2';

  // State for Admin
  const [usersList, setUsersList] = useState<FirestoreUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<FirestoreUser | null>(null);
  
  // State for unread indicator map for each clientId
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [lastMessages, setLastMessages] = useState<Record<string, string>>({});

  // Active chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [clearingHistory, setClearingHistory] = useState<boolean>(false);

  // Ref to automatically scroll to bottom of chat
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load clients list if administrator
  useEffect(() => {
    if (!isAdmin) return;
    
    const loadUsers = async () => {
      setLoadingUsers(true);
      const path = 'users';
      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const loadedUsers: FirestoreUser[] = [];
        querySnapshot.forEach((docSnap) => {
          const uData = docSnap.data();
          let createdDate: Date | null = null;
          if (uData.createdAt) {
            createdDate = uData.createdAt.toDate ? uData.createdAt.toDate() : new Date(uData.createdAt);
          }
          // Do not list ourselves (the admin) in client chats list
          if (docSnap.id !== user?.uid) {
            loadedUsers.push({
              id: docSnap.id,
              email: uData.email || 'N/A',
              name: uData.name,
              createdAt: createdDate,
            });
          }
        });
        setUsersList(loadedUsers);
      } catch (err) {
        console.error('Error fetching chat users:', err);
        handleFirestoreError(err, OperationType.LIST, path);
      } finally {
        setLoadingUsers(false);
      }
    };

    loadUsers();
  }, [isAdmin, user?.uid]);

  // Read unread counts and last message previews for all users (Admin only)
  useEffect(() => {
    if (!isAdmin || usersList.length === 0) return;

    const unsubscribers = usersList.map((client) => {
      const messagesRef = collection(db, 'chats', client.id, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'desc'));
      
      return onSnapshot(q, (snapshot) => {
        let unreadCount = 0;
        let lastText = '';
        
        snapshot.docs.forEach((dDoc, idx) => {
          const mData = dDoc.data();
          if (idx === 0) {
            lastText = mData.text || '';
          }
          if (mData.senderId !== user?.uid && !mData.readByAdmin) {
            unreadCount++;
          }
        });

        setUnreadCounts(prev => ({ ...prev, [client.id]: unreadCount }));
        setLastMessages(prev => ({ ...prev, [client.id]: lastText }));
      }, (err) => {
        console.warn(`Listen failed on user chats metadata context for ${client.id}:`, err);
      });
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [isAdmin, usersList, user?.uid]);

  // Determine active conversation channel path ID
  const chatChannelId = isAdmin ? selectedClient?.id : user?.uid;

  // Real-time listener for current chat messages
  useEffect(() => {
    if (!chatChannelId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    const path = `chats/${chatChannelId}/messages`;
    const messagesRef = collection(db, 'chats', chatChannelId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedMessages: ChatMessage[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        loadedMessages.push({
          id: docSnap.id,
          senderId: data.senderId,
          senderEmail: data.senderEmail,
          text: data.text,
          timestamp: data.timestamp,
          readByAdmin: data.readByAdmin ?? true,
          readByClient: data.readByClient ?? true,
        });
      });
      
      setMessages(loadedMessages);
      setLoadingMessages(false);

      // Trigger marking received messages as "read" asynchronously
      markMessagesAsRead(loadedMessages);
    }, (error) => {
      setLoadingMessages(false);
      handleFirestoreError(error, OperationType.GET, path);
    });

    return () => unsubscribe();
  }, [chatChannelId]);

  // Helper to mark incoming messages as read
  const markMessagesAsRead = async (loadedMsgs: ChatMessage[]) => {
    if (!chatChannelId || !user) return;

    const unreadMsgs = loadedMsgs.filter((msg) => {
      if (isAdmin) {
        // Administrator reads messages sent by the client, where readByAdmin is false
        return msg.senderId !== user.uid && !msg.readByAdmin;
      } else {
        // Client reads messages sent by administrator, where readByClient is false
        return msg.senderId !== user.uid && !msg.readByClient;
      }
    });

    if (unreadMsgs.length === 0) return;

    try {
      const batch = writeBatch(db);
      unreadMsgs.forEach((msg) => {
        const msgDocRef = doc(db, 'chats', chatChannelId, 'messages', msg.id);
        batch.update(msgDocRef, isAdmin ? { readByAdmin: true } : { readByClient: true });
      });
      await batch.commit();
    } catch (err) {
      console.warn('Silent read-recipients batch confirmation statement failed:', err);
    }
  };

  // Scroll to bottom helper
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Dispatch a message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = inputText.trim();
    if (!cleanText || !chatChannelId || !user || sending) return;

    setSending(true);
    setInputText('');
    const path = `chats/${chatChannelId}/messages`;

    try {
      const messagesRef = collection(db, 'chats', chatChannelId, 'messages');
      const randomMsgId = Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
      const msgDoc = doc(messagesRef, randomMsgId);

      await setDoc(msgDoc, {
        senderId: user.uid,
        senderEmail: user.email || 'Anonymous',
        text: cleanText,
        timestamp: serverTimestamp(),
        readByAdmin: isAdmin ? true : false,
        readByClient: isAdmin ? false : true,
      });
    } catch (err) {
      console.error('Failed to send secure chat message document:', err);
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setSending(false);
    }
  };

  // Purge/clear conversation channel (manage chat history independently for each user)
  const handlePurgeHistory = async () => {
    if (!chatChannelId || messages.length === 0) return;
    if (!confirm('Are you absolutely sure you want to permanently clear the conversation history for this client workspace? This action is immutable.')) {
      return;
    }

    setClearingHistory(true);
    const path = `chats/${chatChannelId}/messages`;

    try {
      const batch = writeBatch(db);
      messages.forEach((msg) => {
        const msgDocRef = doc(db, 'chats', chatChannelId, 'messages', msg.id);
        batch.delete(msgDocRef);
      });
      await batch.commit();
    } catch (err) {
      console.error('Purge chat execution failed:', err);
      handleFirestoreError(err, OperationType.DELETE, path);
    } finally {
      setClearingHistory(false);
    }
  };

  // Search filter matching
  const filteredUsers = usersList.filter((u) => {
    const qStr = searchQuery.toLowerCase();
    return u.email.toLowerCase().includes(qStr) || u.id.toLowerCase().includes(qStr);
  });

  return (
    <div id="secure-chat-container" className="flex-1 overflow-hidden h-full flex bg-slate-50 dark:bg-slate-950">
      
      {/* 1. Admin Master Panel Layout (Two-Pane Split-Screen) */}
      {isAdmin ? (
        <div className="flex-1 flex overflow-hidden min-h-0 bg-slate-50 dark:bg-slate-950">
          
          {/* Left panel: Clients Directory Search */}
          <div className={`w-full md:w-80 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-white dark:bg-slate-900 shrink-0 ${selectedClient ? 'hidden md:flex' : 'flex'}`}>
            {/* Search client list Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Secure Direct Channels</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Choose a client tunnel to chat directly</p>
              
              <div className="relative mt-3">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="chat-user-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search client index..."
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-[11px] bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* List scroll area */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loadingUsers ? (
                <div className="py-20 flex flex-col items-center text-slate-400 text-xs">
                  <Loader2 className="w-6 h-6 animate-spin mb-2" />
                  <span>Loading connections...</span>
                </div>
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map((client) => {
                  const isActive = selectedClient?.id === client.id;
                  const unread = unreadCounts[client.id] || 0;
                  const lastMsg = lastMessages[client.id] || '';

                  return (
                    <button
                      key={client.id}
                      id={`chat-user-row-${client.id}`}
                      onClick={() => setSelectedClient(client)}
                      className={`w-full text-left p-3 rounded-xl flex items-center justify-between transition-all duration-150 cursor-pointer ${
                        isActive
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-950 text-emerald-950 dark:text-emerald-100'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent text-slate-750 dark:text-slate-350'
                      }`}
                    >
                      <div className="min-w-0 flex-1 flex items-center space-x-3">
                        <div className={`w-8.5 h-8.5 rounded-full flex items-center justify-center shrink-0 ${
                          isActive 
                            ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}>
                          <User className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold truncate">
                            {client.name || client.email.split('@')[0]}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">
                            {lastMsg || <span className="italic text-slate-300 dark:text-slate-650">No communications yet</span>}
                          </p>
                        </div>
                      </div>

                      {unread > 0 && (
                        <span className="ml-2 shrink-0 bg-emerald-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full font-mono min-w-[16px] text-center">
                          {unread}
                        </span>
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="py-20 text-center text-slate-400 text-xs">
                  <Inbox className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <span>No client records match criteria</span>
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Main Conversation pane */}
          <div className={`flex-1 flex flex-col overflow-hidden min-w-0 bg-slate-50 dark:bg-slate-950 relative ${!selectedClient ? 'hidden md:flex' : 'flex'}`}>
            <AnimatePresence mode="wait">
              {selectedClient ? (
                <motion.div
                  key={selectedClient.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col overflow-hidden h-full"
                >
                  {/* Top metadata control bar */}
                  <div className="h-16 px-4 md:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                    <div className="min-w-0 flex items-center space-x-3">
                      <button
                        type="button"
                        onClick={() => setSelectedClient(null)}
                        className="md:hidden p-1.5 -ml-1 rounded-lg text-slate-500 hover:text-slate-850 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-150 dark:hover:bg-slate-800 transition shrink-0"
                        title="Back to clients list"
                      >
                        <ArrowLeft className="w-4.5 h-4.5" />
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 truncate" title={selectedClient.email}>
                            {selectedClient.name ? `${selectedClient.name} (${selectedClient.email})` : selectedClient.email}
                          </h4>
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        </div>
                        <p className="text-[9px] sm:text-[10px] text-slate-400 font-mono select-all truncate">Workspace: {selectedClient.id}</p>
                      </div>
                    </div>

                    <button
                      id="btn-purge-chat-admin"
                      onClick={handlePurgeHistory}
                      disabled={clearingHistory || messages.length === 0}
                      className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-red-200 hover:border-red-300 bg-red-50 hover:bg-red-100 text-red-700 transition font-bold text-[8.5px] sm:text-[10px] tracking-wide uppercase cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Clear chat and message documentation history for this client"
                    >
                      <Trash2 className="w-2 h-3 sm:w-3.5 sm:h-3.5" />
                      <span className="text-xs">{clearingHistory ? 'Purging...' : 'Purge History'}</span>
                    </button>
                  </div>

                  {/* Message stack container */}
                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {loadingMessages ? (
                      <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" />
                        <span>Decrypting chat log indices...</span>
                      </div>
                    ) : messages.length > 0 ? (
                      messages.map((msg) => {
                        const isMe = msg.senderId === user?.uid;
                        const formattedTime = msg.timestamp
                          ? (msg.timestamp.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '';

                        return (
                          <div
                            key={msg.id}
                            id={`message-bubble-${msg.id}`}
                            className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className="max-w-[70%] flex flex-col">
                              <div className={`p-4 rounded-2xl text-xs font-medium border shadow-xs transition-all leading-relaxed ${
                                isMe
                                  ? 'bg-slate-800 dark:bg-slate-900 text-white border-slate-700 dark:border-slate-800 rounded-tr-none'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-150 rounded-tl-none'
                              }`}>
                                <p className="break-words font-sans">{msg.text}</p>
                              </div>
                              <div className={`flex items-center space-x-1 mt-1 text-[9px] text-slate-400 font-mono ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <span>{formattedTime}</span>
                                {isMe && (
                                  <span>
                                    {msg.readByClient ? (
                                      <CheckCheck className="w-3.5 h-3.5 text-emerald-500" title="Read by Client" />
                                    ) : (
                                      <Check className="w-3.5 h-3.5 text-slate-300" title="Delivered" />
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center px-10">
                        <MessageSquare className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3" />
                        <h5 className="font-bold text-slate-700 dark:text-slate-350 text-xs">No Messages</h5>
                        <p className="text-[10px] text-slate-400 mt-1 max-w-[240px]">Use the composer panel below to initiate secure communications with this client.</p>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Chat Composer Form */}
                  <form
                    onSubmit={handleSendMessage}
                    className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center space-x-2 shrink-0"
                  >
                    <input
                      id="admin-chat-composer"
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder={`Send safe message to client...`}
                      className="flex-1 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 text-xs text-left"
                    />
                    <button
                      id="btn-admin-send-chat"
                      type="submit"
                      disabled={!inputText.trim() || sending}
                      className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 transition flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </motion.div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-slate-950">
                  <div className="w-14 h-14 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs flex items-center justify-center text-emerald-600 dark:text-emerald-500 mb-4 scale-105">
                    <Shield className="w-7 h-7" />
                  </div>
                  <h4 className="font-bold text-slate-850 dark:text-slate-100 text-sm">Secure Command Communications Portal</h4>
                  <p className="text-[11px] text-slate-405 mt-1 max-w-sm leading-relaxed">
                    Choose one of your active Client Vault directories from the directories list in the left-hand pane to inspect chat files and establish a bidirectional encrypted audio/text secure tunnel.
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>

        </div>
      ) : (
        
        /* 2. Client Side Chat Workspace Component Layout */
        <div className="flex-1 flex flex-col overflow-hidden h-full bg-slate-50 dark:bg-slate-950">
          
          {/* Header context information of conversation */}
          <div className="h-16 px-6 sm:px-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-8.5 h-8.5 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 border border-blue-200/40 flex items-center justify-center shrink-0">
                <Shield className="w-4.5 h-4.5" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Secure Central Systems Support</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping shrink-0" />
                </div>
                <p className="text-[10px] text-slate-400">Direct telemetry interface with Global Operations Admin</p>
              </div>
            </div>
            
            <div className="text-[10px] text-slate-400 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 px-3 py-1 rounded-lg shrink-0">
              Connection Status: <span className="text-emerald-500 font-bold">MUTUAL</span>
            </div>
          </div>

          {/* Chat scrolling feed container */}
          <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-6 space-y-4">
            {loadingMessages ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span>Synchronizing secure log history streams...</span>
              </div>
            ) : messages.length > 0 ? (
              messages.map((msg) => {
                const isMe = msg.senderId === user?.uid;
                const formattedTime = msg.timestamp
                  ? (msg.timestamp.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '';

                return (
                  <div
                    key={msg.id}
                    id={`message-bubble-${msg.id}`}
                    className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className="max-w-[75%] sm:max-w-[65%] flex flex-col">
                      <div className={`p-4 rounded-2xl text-xs font-medium border shadow-xs transition-all leading-relaxed ${
                        isMe
                          ? 'bg-blue-600 dark:bg-blue-900 border-blue-550 dark:border-blue-800 text-white rounded-tr-none'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-150 rounded-tl-none'
                      }`}>
                        <p className="break-words font-sans">{msg.text}</p>
                      </div>
                      <div className={`flex items-center space-x-1 mt-1 text-[9px] text-slate-400 font-mono ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <span>{formattedTime}</span>
                        {isMe && (
                          <span>
                            {msg.readByAdmin ? (
                              <CheckCheck className="w-3.5 h-3.5 text-blue-500" title="Read by Admin" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-slate-350" title="Dispatched" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center px-10">
                <MessageSquare className="w-12 h-12 text-slate-250 dark:text-slate-800 mb-3" />
                <h5 className="font-bold text-slate-700 dark:text-slate-350 text-xs">Direct Channel Initiated</h5>
                <p className="text-[10px] text-slate-400 mt-1 max-w-[280px]">Greetings developer. This communication line is bridged directly with Vault Operations Administration. Please type your queries or assistance details below.</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer composing input form */}
          <form
            onSubmit={handleSendMessage}
            className="p-4 sm:p-6 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center space-x-3 shrink-0"
          >
            <input
              id="client-chat-composer"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type message to Central command..."
              className="flex-1 border border-slate-200 dark:border-slate-800 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 placeholder-slate-450 focus:outline-hidden focus:ring-1 focus:ring-blue-500 text-xs text-left"
            />
            <button
              id="btn-client-send-chat"
              type="submit"
              disabled={!inputText.trim() || sending}
              className="p-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-md shadow-blue-150"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

        </div>
      )}

    </div>
  );
};
