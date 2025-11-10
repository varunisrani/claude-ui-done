import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout/Layout';
import { Home } from './components/Home/Home';
import { ConversationView } from './components/ConversationView/ConversationView';
import { KanbanBoard } from './components/KanbanBoard/KanbanBoard';
import { ConversationsProvider } from './contexts/ConversationsContext';
import { StreamStatusProvider } from './contexts/StreamStatusContext';
import { PreferencesProvider } from './contexts/PreferencesContext';
import { KanbanProvider } from './contexts/KanbanContext';
import './styles/global.css';

function ChatApp() {
  return (
    <PreferencesProvider>
      <StreamStatusProvider>
        <ConversationsProvider>
          <KanbanProvider>
            <Routes>
              <Route path="/" element={
                <Layout>
                  <Home />
                </Layout>
              } />
              <Route path="/c/:sessionId" element={
                <Layout>
                  <ConversationView />
                </Layout>
              } />
              <Route path="/kanban" element={
                <Layout>
                  <KanbanBoard />
                </Layout>
              } />
            </Routes>
          </KanbanProvider>
        </ConversationsProvider>
      </StreamStatusProvider>
    </PreferencesProvider>
  );
}

export default ChatApp;