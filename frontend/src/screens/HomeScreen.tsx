import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Platform, StatusBar } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { MenuCard } from '../components/MenuCard';
import { colors } from '../theme/colors';
import {
  PlusCircle,
  FileText,
  Trophy,
  Edit3,
  BadgePercent,
  Users,
  ShieldAlert,
  LogOut,
  Sparkles,
  CheckCircle2,
} from 'lucide-react-native';

interface HomeScreenProps {
  onNavigate: (screen: string) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigate }) => {
  const { user, logout } = useAuth();

  // Display 923 or username (in screenshot it showed 923)
  const displayId = user?.username ? (user.username.startsWith('0') ? user.username.substring(1) : user.username) : '923';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Welcome Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeSubtitle}>Welcome back,</Text>
            <Text style={styles.usernameText}>{displayId}</Text>
          </View>

          {/* Logout Action Button (Matching screenshot top right) */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.logoutButton}
            onPress={logout}
            accessibilityLabel="Log out"
          >
            <LogOut size={20} color="#EF4444" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        {/* Action Cards Menu */}
        <View style={styles.menuContainer}>
          {/* 1. Add Ticket */}
          <MenuCard
            title="Add Ticket"
            subtitle="Create new entries"
            IconComponent={PlusCircle}
            onPress={() => onNavigate('add-ticket')}
          />

          {/* 2. Reports */}
          <MenuCard
            title="Reports"
            subtitle="View analytics"
            IconComponent={FileText}
            onPress={() => onNavigate('reports')}
          />

          {/* 3. Results */}
          <MenuCard
            title="Results"
            subtitle="Check winning"
            IconComponent={Trophy}
            onPress={() => onNavigate('results')}
          />

          {/* 4. Edit / Delete */}
          <MenuCard
            title="Edit / Delete"
            subtitle="Manage records"
            IconComponent={Edit3}
            onPress={() => onNavigate('edit-delete')}
          />

          {/* 5. Manage Sales */}
          <MenuCard
            title="Manage Sales"
            subtitle="Sales control"
            IconComponent={BadgePercent}
            onPress={() => onNavigate('manage-sales')}
          />

          {/* 6. Scheme */}
          <MenuCard
            title="Scheme"
            subtitle="Prize & rate list"
            IconComponent={Sparkles}
            onPress={() => onNavigate('scheme')}
            cardColor="#0D9488"
          />

          {/* 7. Admin Controls */}
          {user?.role === 'ADMIN' && (
            <>
              <MenuCard
                title="Result Checking"
                subtitle="Verify user winners"
                IconComponent={CheckCircle2}
                onPress={() => onNavigate('result-checking')}
                cardColor="#059669"
              />

              <MenuCard
                title="Manage Users"
                subtitle="Team hierarchy"
                IconComponent={Users}
                onPress={() => onNavigate('manage-users')}
              />

              <MenuCard
                title="Number Limits"
                subtitle="Capacity & rules"
                IconComponent={ShieldAlert}
                onPress={() => onNavigate('number-limits')}
                cardColor="#0284C7" // Deep Sky Blue for admin distinction
              />
            </>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.versionText}>Version 1.3</Text>
          <Text style={styles.copyrightText}>© 2026 SecureApp. All rights reserved.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'android' ? 20 : 0,
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 8,
  },
  welcomeSubtitle: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '400',
    marginBottom: 2,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  usernameText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563EB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  adminBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  logoutButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FEE2E2', // Light pastel red background matching screenshot
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  menuContainer: {
    marginTop: 8,
  },
  footer: {
    alignItems: 'center',
    marginTop: 36,
    paddingVertical: 12,
  },
  versionText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
    marginBottom: 4,
  },
  copyrightText: {
    fontSize: 12,
    color: '#CBD5E1',
  },
});
