import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, View, StatusBar } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { TicketEntryScreen } from './src/screens/TicketEntryScreen';
import { EditDeleteScreen } from './src/screens/EditDeleteScreen';
import { ResultsScreen } from './src/screens/ResultsScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import { ManageSalesScreen } from './src/screens/ManageSalesScreen';
import { ManageUsersScreen } from './src/screens/ManageUsersScreen';
import { NumberLimitsScreen } from './src/screens/NumberLimitsScreen';
import { SchemeScreen } from './src/screens/SchemeScreen';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

type Screen =
  | 'home'
  | 'add-ticket'
  | 'reports'
  | 'results'
  | 'result-checking'
  | 'edit-delete'
  | 'manage-sales'
  | 'manage-users'
  | 'number-limits'
  | 'scheme';

function MainNavigator() {
  const { user, isLoading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');

  if (isLoading) {
    return <View style={styles.container} />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  switch (currentScreen) {
    case 'add-ticket':
      return <TicketEntryScreen onBack={() => setCurrentScreen('home')} />;
    case 'edit-delete':
      return <EditDeleteScreen onBack={() => setCurrentScreen('home')} />;
    case 'results':
      return <ResultsScreen onBack={() => setCurrentScreen('home')} />;
    case 'result-checking':
      return <ResultsScreen onBack={() => setCurrentScreen('home')} initialTab="checking" />;
    case 'reports':
      return <ReportsScreen onBack={() => setCurrentScreen('home')} />;
    case 'manage-sales':
      return (
        <ManageSalesScreen
          onBack={() => setCurrentScreen('home')}
          onNavigateAddTicket={() => setCurrentScreen('add-ticket')}
        />
      );
    case 'manage-users':
      return <ManageUsersScreen onBack={() => setCurrentScreen('home')} />;
    case 'number-limits':
      return <NumberLimitsScreen onBack={() => setCurrentScreen('home')} />;
    case 'scheme':
      return <SchemeScreen onBack={() => setCurrentScreen('home')} />;
    case 'home':
    default:
      return <HomeScreen onNavigate={(s) => setCurrentScreen(s as Screen)} />;
  }
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="dark-content" />
          <MainNavigator />
        </SafeAreaView>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
});
