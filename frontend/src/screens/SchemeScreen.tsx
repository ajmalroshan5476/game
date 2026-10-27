import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  StatusBar,
} from 'react-native';
import { ArrowLeft, Home, ChevronDown } from 'lucide-react-native';
import { colors } from '../theme/colors';

interface SchemeScreenProps {
  onBack: () => void;
}

interface SchemeItem {
  name: string;
  group: string;
  rate: number;
  rows: Array<{
    position: number;
    count: number;
    amount: number;
    superAmount: number;
  }>;
}

export const SchemeScreen: React.FC<SchemeScreenProps> = ({ onBack }) => {
  const games = [
    { id: '1', code: 'DEAR1', name: 'DEAR 1 PM' },
    { id: '2', code: 'LSK3', name: 'LSK 3 PM' },
    { id: '3', code: 'DEAR6', name: 'DEAR 6 PM' },
    { id: '4', code: 'DEAR8', name: 'DEAR 8 PM' },
  ];

  const [selectedGame, setSelectedGame] = useState(games[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const getSchemeData = (code: string): SchemeItem[] => [
    {
      name: `${code}-SUPER`,
      group: 'Group 3',
      rate: 10,
      rows: [
        { position: 1, count: 1, amount: 5000, superAmount: 400 },
        { position: 2, count: 1, amount: 500, superAmount: 50 },
        { position: 3, count: 1, amount: 250, superAmount: 20 },
        { position: 4, count: 1, amount: 100, superAmount: 20 },
        { position: 5, count: 1, amount: 50, superAmount: 20 },
        { position: 6, count: 30, amount: 20, superAmount: 10 },
      ],
    },
    {
      name: `${code}-BOX`,
      group: 'Group 3',
      rate: 10,
      rows: [
        { position: 1, count: 1, amount: 3000, superAmount: 300 },
        { position: 2, count: 1, amount: 800, superAmount: 30 },
        { position: 3, count: 1, amount: 800, superAmount: 30 },
        { position: 4, count: 1, amount: 800, superAmount: 30 },
        { position: 5, count: 1, amount: 800, superAmount: 30 },
        { position: 6, count: 1, amount: 800, superAmount: 30 },
      ],
    },
    {
      name: `${code}-AB`,
      group: 'Group 2',
      rate: 10,
      rows: [{ position: 1, count: 1, amount: 700, superAmount: 30 }],
    },
    {
      name: `${code}-BC`,
      group: 'Group 2',
      rate: 10,
      rows: [{ position: 1, count: 1, amount: 700, superAmount: 30 }],
    },
    {
      name: `${code}-AC`,
      group: 'Group 2',
      rate: 10,
      rows: [{ position: 1, count: 1, amount: 700, superAmount: 30 }],
    },
    {
      name: `${code}-A`,
      group: 'Group 1',
      rate: 12,
      rows: [{ position: 1, count: 1, amount: 100, superAmount: 0 }],
    },
    {
      name: `${code}-B`,
      group: 'Group 1',
      rate: 12,
      rows: [{ position: 1, count: 1, amount: 100, superAmount: 0 }],
    },
    {
      name: `${code}-C`,
      group: 'Group 1',
      rate: 12,
      rows: [{ position: 1, count: 1, amount: 100, superAmount: 0 }],
    },
  ];

  const schemeData = getSchemeData(selectedGame.code);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      {/* Header matching Screenshot */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scheme</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={onBack} activeOpacity={0.7}>
          <Home size={24} color="#E53935" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Game Picker Dropdown */}
        <View style={styles.pickerContainer}>
          <TouchableOpacity
            style={styles.pickerButton}
            activeOpacity={0.85}
            onPress={() => setDropdownOpen(!dropdownOpen)}
          >
            <Text style={styles.pickerButtonText}>{selectedGame.name}</Text>
            <ChevronDown size={20} color="#64748B" />
          </TouchableOpacity>

          {dropdownOpen && (
            <View style={styles.dropdownList}>
              {games.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.dropdownItem, selectedGame.id === g.id && styles.dropdownItemActive]}
                  onPress={() => {
                    setSelectedGame(g);
                    setDropdownOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      selectedGame.id === g.id && styles.dropdownItemTextActive,
                    ]}
                  >
                    {g.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Scheme Cards */}
        {schemeData.map((item, idx) => (
          <View key={idx} style={styles.card}>
            {/* Card Header: Mode Name & Rate Badge */}
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardGroup}>{item.group}</Text>
              </View>
              <View style={styles.rateRow}>
                <Text style={styles.rateLabel}>Rate: </Text>
                <Text style={styles.rateVal}>{item.rate}</Text>
              </View>
            </View>

            {/* Prize Table */}
            <View style={styles.table}>
              {/* Table Header */}
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.thCell, { flex: 1.2 }]}>Position</Text>
                <Text style={[styles.thCell, { flex: 1 }]}>Count</Text>
                <Text style={[styles.thCell, { flex: 1.2 }]}>Amount</Text>
                <Text style={[styles.thCell, { flex: 1 }]}>Super</Text>
              </View>

              {/* Table Rows */}
              {item.rows.map((row, rIdx) => (
                <View key={rIdx} style={[styles.tableRow, rIdx % 2 === 1 && styles.tableRowAlt]}>
                  <Text style={[styles.tdCell, { flex: 1.2 }]}>{row.position}</Text>
                  <Text style={[styles.tdCell, { flex: 1 }]}>{row.count}</Text>
                  <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '700' }]}>{row.amount}</Text>
                  <Text style={[styles.tdCell, { flex: 1 }]}>{row.superAmount}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingTop: Platform.OS === 'android' ? 20 : 0,
  },
  header: {
    height: 54,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  pickerContainer: {
    marginBottom: 16,
    position: 'relative',
    zIndex: 10,
  },
  pickerButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  dropdownList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownItemActive: {
    backgroundColor: '#ECFDF5',
  },
  dropdownItemText: {
    fontSize: 15,
    color: '#334155',
    fontWeight: '600',
  },
  dropdownItemTextActive: {
    color: '#059669',
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardGroup: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rateLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  rateVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  table: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 10,
  },
  thCell: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableRowAlt: {
    backgroundColor: '#FAFAFA',
  },
  tdCell: {
    fontSize: 14,
    color: '#1E293B',
    textAlign: 'center',
  },
});
