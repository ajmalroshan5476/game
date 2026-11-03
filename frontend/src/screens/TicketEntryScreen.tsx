import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { api } from '../api/client';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import {
  Check,
  ChevronRight,
  MessageCircle,
  Camera,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Share2,
  ArrowLeft,
  Clock,
  X,
  ClipboardPaste,
  Users,
  ChevronDown,
  User,
} from 'lucide-react-native';
import { EditTicketModal } from '../components/EditTicketModal';

interface TicketEntryScreenProps {
  onBack: () => void;
}

type DigitGroup = '1' | '2' | '3';
type TicketMode = 'A' | 'B' | 'C' | 'AB' | 'AC' | 'BC' | 'SUPER' | 'BOX';

interface QueuedEntry {
  id: string;
  number: string;
  quantity: number;
  mode: TicketMode;
  isBox: boolean;
  unitPrice: number;
  totalPrice: number;
}

export interface ParsedTicketEntry {
  number: string;
  count: number;
  boxCount?: number;
  digitGroup: '1' | '2' | '3';
}

/**
 * Parses clipboard text into tickets.
 * Supported patterns:
 * - 551-5-5  => Number 551, Count 5 (SUPER), Box 5 (BOX)
 * - 551-2    => Number 551, Count 2 (SUPER)
 * - 24-2     => Number 24, Count 2 (AB)
 * - 7-5      => Number 7, Count 5 (A)
 * Also supports 551:5:5, 551,5,5, space-separated (551 5 5), and multi-line text from WhatsApp / SMS.
 */
export function parseClipboardTicketData(text: string): ParsedTicketEntry[] {
  if (!text || typeof text !== 'string') return [];
  const results: ParsedTicketEntry[] = [];
  const lines = text.split(/[\r\n]+/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Pattern 1: match 3-part or 2-part patterns with hyphens, colons, slashes, or commas
    // e.g. 551-5-5, 551-2, 24-2, 551:5:5, 551,5,5
    const regex = /\b(\d{1,3})\s*[-:=/,]\s*(\d+)(?:\s*[-:=/,]\s*(\d+))?\b/g;
    let match;
    let found = false;
    while ((match = regex.exec(line)) !== null) {
      found = true;
      const num = match[1];
      const count = parseInt(match[2], 10);
      const box = match[3] ? parseInt(match[3], 10) : undefined;
      const dGroup: '1' | '2' | '3' = num.length === 1 ? '1' : num.length === 2 ? '2' : '3';
      results.push({
        number: num,
        count: isNaN(count) || count <= 0 ? 1 : count,
        boxCount: box !== undefined && !isNaN(box) && box > 0 ? box : undefined,
        digitGroup: dGroup,
      });
    }

    if (!found) {
      // Pattern 2: space-separated fallback (e.g. 551 5 5 or 551 2 or 24 2)
      const spaceMatch = line.match(/\b(\d{1,3})\s+(\d+)(?:\s+(\d+))?\b/);
      if (spaceMatch) {
        const num = spaceMatch[1];
        const count = parseInt(spaceMatch[2], 10);
        const box = spaceMatch[3] ? parseInt(spaceMatch[3], 10) : undefined;
        const dGroup: '1' | '2' | '3' = num.length === 1 ? '1' : num.length === 2 ? '2' : '3';
        results.push({
          number: num,
          count: isNaN(count) || count <= 0 ? 1 : count,
          boxCount: box !== undefined && !isNaN(box) && box > 0 ? box : undefined,
          digitGroup: dGroup,
        });
      }
    }
  }

  return results;
}

// Helper to compute all unique permutations of a number string (for "Set" button)
// e.g. "896" -> ["689", "698", "869", "896", "968", "986"]
function getUniquePermutations(str: string): string[] {
  if (str.length <= 1) return [str];
  const results = new Set<string>();

  function permute(arr: string[], m: string[] = []) {
    if (arr.length === 0) {
      results.add(m.join(''));
    } else {
      for (let i = 0; i < arr.length; i++) {
        const curr = arr.slice();
        const next = curr.splice(i, 1);
        permute(curr.slice(), m.concat(next));
      }
    }
  }

  permute(str.split(''));
  return Array.from(results).sort();
}

export const TicketEntryScreen: React.FC<TicketEntryScreenProps> = ({ onBack }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  // Admin User/Seller selection
  const [usersList, setUsersList] = useState<any[]>([]);
  const [targetUserId, setTargetUserId] = useState<string>(''); // '' means Admin Self
  const [userPickerModalVisible, setUserPickerModalVisible] = useState(false);

  // Games & Draws
  const [games, setGames] = useState<any[]>([]);
  const [selectedGame, setSelectedGame] = useState<any>(null);
  const [selectedDraw, setSelectedDraw] = useState<any>(null);
  const [loadingGames, setLoadingGames] = useState(true);

  // Modals
  const [chooseTicketModalVisible, setChooseTicketModalVisible] = useState(false);
  const [confirmedTicket, setConfirmedTicket] = useState<any | null>(null);
  const [lastEnteredTicket, setLastEnteredTicket] = useState<any | null>(null);
  const [editingTicket, setEditingTicket] = useState<any | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [cancellingLastTicket, setCancellingLastTicket] = useState(false);

  // Top Controls State
  const [digitGroup, setDigitGroup] = useState<DigitGroup>('3'); // '1', '2', or '3'
  const [currentTimeStr, setCurrentTimeStr] = useState('00:00:00');

  // Checkboxes matching reference screenshot: Range, Set, 100, 111
  const [isRange, setIsRange] = useState(false);
  const [isSet, setIsSet] = useState(false);
  const [is100, setIs100] = useState(false);
  const [is111, setIs111] = useState(false);

  // Inputs
  const [numberInput, setNumberInput] = useState('');
  const [countInput, setCountInput] = useState('');
  const [boxCountInput, setBoxCountInput] = useState(''); // Specific Box rectangle for 3-digit
  const [startRangeInput, setStartRangeInput] = useState('');
  const [endRangeInput, setEndRangeInput] = useState('');
  const [customerName, setCustomerName] = useState('');

  // Focus refs for automatic pointer advance (Number -> Qty -> Box)
  const numberInputRef = useRef<any>(null);
  const countInputRef = useRef<any>(null);
  const boxInputRef = useRef<any>(null);

  // Message Paste Modal (WhatsApp / Clipboard modal)
  const [messageModalVisible, setMessageModalVisible] = useState(false);
  const [messagePasteInput, setMessagePasteInput] = useState('');

  // Queued Entries
  const [entries, setEntries] = useState<QueuedEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [userPrices, setUserPrices] = useState<any[]>([]);

  // Limit Exceeded Alert
  const [limitAlert, setLimitAlert] = useState<{
    number: string;
    maxQuantity: number;
    currentlyAccepted: number;
    requested: number;
    remaining: number;
  } | null>(null);

  // Live Clock effect
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      setCurrentTimeStr(`${h}:${m}:${s}`);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Load games and individual user ticket pricing
  useEffect(() => {
    loadGames();
    if (isAdmin) {
      loadAdminUsers();
    }
    loadUserPricing();
  }, [isAdmin]);

  const loadAdminUsers = async () => {
    try {
      const res = await api.getUsers();
      setUsersList(res.users || []);
    } catch (err) {
      console.warn('Could not load users for admin ticket entry', err);
    }
  };

  const loadUserPricing = async () => {
    try {
      const res = await api.getMyPrices();
      setUserPrices(res.prices || []);
    } catch {}
  };

  const handleSelectTargetUser = async (uId: string) => {
    setTargetUserId(uId);
    setUserPickerModalVisible(false);
    try {
      let newPrices: any[] = [];
      if (uId && uId !== user?.id) {
        const pRes = await api.getUserPrices(uId);
        newPrices = pRes.prices || [];
      } else {
        const pRes = await api.getMyPrices();
        newPrices = pRes.prices || [];
      }
      setUserPrices(newPrices);

      // Re-calculate prices for already queued entries with new user pricing
      if (entries.length > 0) {
        setEntries((prev) =>
          prev.map((e) => {
            const specific = selectedGame?.id
              ? newPrices.find((p) => p.gameId === selectedGame.id && p.mode === e.mode)
              : null;
            const globalRate = newPrices.find((p) => !p.gameId && p.mode === e.mode);
            const unitPrice =
              specific && !isNaN(Number(specific.price))
                ? Number(specific.price)
                : globalRate && !isNaN(Number(globalRate.price))
                ? Number(globalRate.price)
                : ['A', 'B', 'C'].includes(e.mode)
                ? 12
                : 10;
            return {
              ...e,
              unitPrice,
              totalPrice: e.quantity * unitPrice,
            };
          })
        );
      }
    } catch (err) {
      console.warn('Could not load user pricing', err);
    }
  };

  const getModeUnitPrice = (mode: string) => {
    if (selectedGame?.id) {
      const specific = userPrices.find((p) => p.gameId === selectedGame.id && p.mode === mode);
      if (specific && !isNaN(Number(specific.price))) {
        return Number(specific.price);
      }
    }
    const globalRate = userPrices.find((p) => !p.gameId && p.mode === mode);
    if (globalRate && !isNaN(Number(globalRate.price))) {
      return Number(globalRate.price);
    }
    return ['A', 'B', 'C'].includes(mode) ? 12 : 10;
  };

  const loadGames = async () => {
    try {
      setLoadingGames(true);
      const res = await api.getGames();
      const allGames = res.games || [];
      setGames(allGames);
      if (allGames.length > 0) {
        selectGame(allGames[0]);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not load games');
    } finally {
      setLoadingGames(false);
    }
  };

  const selectGame = (game: any) => {
    setSelectedGame(game);
    if (game.draws && game.draws.length > 0) {
      setSelectedDraw(game.draws[0]);
    } else {
      setSelectedDraw(null);
    }
    setChooseTicketModalVisible(false);
  };

  const cycleDigitGroup = () => {
    if (digitGroup === '1') setDigitGroup('2');
    else if (digitGroup === '2') setDigitGroup('3');
    else setDigitGroup('1');
    setNumberInput('');
  };

  // Compute Game Short Code (e.g. LSK3, DEAR1, DEAR6, DEAR8)
  const getGameCode = () => {
    if (!selectedGame) return 'LSK3';
    const name = selectedGame.name || '';
    if (name.includes('LSK') || name.includes('3 PM')) return 'LSK3';
    if (name.includes('1 PM')) return 'DEAR1';
    if (name.includes('6 PM')) return 'DEAR6';
    if (name.includes('8 PM')) return 'DEAR8';
    return (selectedGame.code || 'GAME').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5);
  };

  // Helper for game subtitle in Choose Ticket modal
  const getGameSubtitle = (name: string) => {
    if (name.includes('3 PM')) return 'DAILY DRAW';
    if (name.includes('1 PM')) return 'AFTERNOON DRAW';
    if (name.includes('6 PM')) return 'EVENING DRAW';
    if (name.includes('8 PM')) return 'NIGHT DRAW';
    return 'STANDARD DRAW';
  };

  // Helper for game card gradient color in Choose Ticket modal
  const getGameCardColor = (name: string) => {
    if (name.includes('3 PM')) return '#00C853';
    if (name.includes('1 PM')) return '#FF6D00';
    if (name.includes('6 PM')) return '#00897B';
    if (name.includes('8 PM')) return '#E53935';
    return '#2563EB';
  };

  // Handle number input according to digit group with auto-advance pointer to Qty column
  const handleNumberChange = (val: string) => {
    const clean = val.replace(/[^0-9]/g, '');
    const maxLen = digitGroup === '1' ? 1 : digitGroup === '2' ? 2 : 3;
    const finalVal = clean.slice(0, maxLen);
    setNumberInput(finalVal);

    // Auto-advance pointer to Qty (Count) column when number is complete!
    if (clean.length >= maxLen) {
      setTimeout(() => {
        countInputRef.current?.focus();
      }, 50);
    }
  };

  /**
   * Applies parsed tickets from clipboard / WhatsApp message.
   * - If 1 ticket is parsed (e.g. 551-5-5, 551-2, 24-2): fills exact Number, Count, and Box columns!
   * - If multiple tickets are parsed: adds all to queue entries and fills columns!
   */
  const applyParsedTickets = (parsed: ParsedTicketEntry[]) => {
    if (!parsed || parsed.length === 0) return;

    if (parsed.length === 1) {
      const item = parsed[0];
      setDigitGroup(item.digitGroup);
      setNumberInput(item.number);
      setCountInput(String(item.count));
      setBoxCountInput(item.boxCount !== undefined ? String(item.boxCount) : '');
      setIsRange(false);

      setTimeout(() => {
        if (item.digitGroup === '3' && item.boxCount !== undefined) {
          boxInputRef.current?.focus();
        } else {
          countInputRef.current?.focus();
        }
      }, 80);

      Alert.alert(
        'Clipboard Pasted!',
        `Pasted into exact columns:\n• Number: ${item.number}\n• Qty: ${item.count}${item.boxCount !== undefined ? `\n• Box: ${item.boxCount}` : ''}`
      );
      return;
    }

    // Multiple tickets in clipboard
    const newItems: QueuedEntry[] = [];
    for (const item of parsed) {
      if (item.digitGroup === '3') {
        const superPrice = getModeUnitPrice('SUPER');
        const boxPrice = getModeUnitPrice('BOX');

        newItems.push({
          id: Math.random().toString(36).substring(2, 9),
          number: item.number.padStart(3, '0'),
          quantity: item.count,
          mode: 'SUPER',
          isBox: false,
          unitPrice: superPrice,
          totalPrice: item.count * superPrice,
        });

        if (item.boxCount && item.boxCount > 0) {
          newItems.push({
            id: Math.random().toString(36).substring(2, 9),
            number: item.number.padStart(3, '0'),
            quantity: item.boxCount,
            mode: 'BOX',
            isBox: true,
            unitPrice: boxPrice,
            totalPrice: item.boxCount * boxPrice,
          });
        }
      } else if (item.digitGroup === '2') {
        const modePrice = getModeUnitPrice('AB');
        newItems.push({
          id: Math.random().toString(36).substring(2, 9),
          number: item.number.padStart(2, '0'),
          quantity: item.count,
          mode: 'AB',
          isBox: false,
          unitPrice: modePrice,
          totalPrice: item.count * modePrice,
        });
      } else if (item.digitGroup === '1') {
        const modePrice = getModeUnitPrice('A');
        newItems.push({
          id: Math.random().toString(36).substring(2, 9),
          number: item.number,
          quantity: item.count,
          mode: 'A',
          isBox: false,
          unitPrice: modePrice,
          totalPrice: item.count * modePrice,
        });
      }
    }

    setEntries((prev) => [...prev, ...newItems]);

    // Also place first item into columns
    const first = parsed[0];
    setDigitGroup(first.digitGroup);
    setNumberInput(first.number);
    setCountInput(String(first.count));
    setBoxCountInput(first.boxCount !== undefined ? String(first.boxCount) : '');
    setIsRange(false);

    Alert.alert(
      'Tickets Added to Queue!',
      `Successfully parsed and added ${newItems.length} entries (${parsed.length} orders) from clipboard into queue!\n\nReady to SAVE.`
    );
  };

  /**
   * Action when clicking the Message Button in the bottom bar
   */
  const handleMessageButtonClick = async () => {
    let clipText = '';
    try {
      clipText = await Clipboard.getStringAsync();
    } catch {
      if (typeof navigator !== 'undefined' && (navigator as any).clipboard) {
        try {
          clipText = await (navigator as any).clipboard.readText();
        } catch {}
      }
    }

    if (clipText && clipText.trim()) {
      const parsed = parseClipboardTicketData(clipText);
      if (parsed.length > 0) {
        applyParsedTickets(parsed);
        return;
      }
    }

    // If clipboard is empty or had no match, open fallback dialog
    setMessagePasteInput(clipText || '');
    setMessageModalVisible(true);
  };

  /**
   * Action when clicking a Mode Button (e.g. SUPER, BOX, ALL, or AB, BC, AC, ALL, or A, B, C, ALL)
   */
  const handleModeButtonClick = (actionType: 'A' | 'B' | 'C' | 'AB' | 'BC' | 'AC' | 'SUPER' | 'BOX' | 'ALL') => {
    const defaultQty = parseInt(countInput, 10) || 1;
    const boxQty = parseInt(boxCountInput, 10) || defaultQty;

    // 1. Determine the base numbers list
    let targetNumbers: string[] = [];

    if (isRange) {
      const s = parseInt(startRangeInput, 10);
      const e = parseInt(endRangeInput, 10);
      if (isNaN(s) || isNaN(e) || s > e) {
        Alert.alert('Invalid Range', 'Please enter a valid start and end number');
        return;
      }
      if (e - s + 1 > 500) {
        Alert.alert('Range Limit', 'Maximum 500 numbers allowed in a range');
        return;
      }
      const padLen = digitGroup === '1' ? 1 : digitGroup === '2' ? 2 : 3;
      for (let i = s; i <= e; i++) {
        targetNumbers.push(String(i).padStart(padLen, '0'));
      }
    } else {
      const cleanNum = numberInput.trim();
      if (!cleanNum) {
        Alert.alert('Number Required', 'Please enter a number');
        return;
      }

      // Check digit length
      const requiredLen = digitGroup === '1' ? 1 : digitGroup === '2' ? 2 : 3;
      const formattedNum = cleanNum.padStart(requiredLen, '0');

      if (isSet) {
        // "Set" button generates all unique permutations!
        targetNumbers = getUniquePermutations(formattedNum);
      } else {
        targetNumbers = [formattedNum];
      }
    }

    if (targetNumbers.length === 0) return;

    const newItems: QueuedEntry[] = [];

    // 2. Generate entries based on actionType and digitGroup
    if (digitGroup === '3') {
      const superPrice = getModeUnitPrice('SUPER');
      const boxPrice = getModeUnitPrice('BOX');

      if (actionType === 'SUPER') {
        for (const num of targetNumbers) {
          newItems.push({
            id: Math.random().toString(36).substring(2, 9),
            number: num,
            quantity: defaultQty,
            mode: 'SUPER',
            isBox: false,
            unitPrice: superPrice,
            totalPrice: defaultQty * superPrice,
          });
        }
      } else if (actionType === 'BOX') {
        const bQty = isRange ? defaultQty : (boxCountInput.trim() ? boxQty : defaultQty);
        for (const num of targetNumbers) {
          newItems.push({
            id: Math.random().toString(36).substring(2, 9),
            number: num,
            quantity: bQty,
            mode: 'BOX',
            isBox: true,
            unitPrice: boxPrice,
            totalPrice: bQty * boxPrice,
          });
        }
      } else if (actionType === 'ALL') {
        const bQty = isRange ? defaultQty : (boxCountInput.trim() ? boxQty : defaultQty);
        for (const num of targetNumbers) {
          // Always add SUPER
          newItems.push({
            id: Math.random().toString(36).substring(2, 9),
            number: num,
            quantity: defaultQty,
            mode: 'SUPER',
            isBox: false,
            unitPrice: superPrice,
            totalPrice: defaultQty * superPrice,
          });
          // Always add BOX
          newItems.push({
            id: Math.random().toString(36).substring(2, 9),
            number: num,
            quantity: bQty,
            mode: 'BOX',
            isBox: true,
            unitPrice: boxPrice,
            totalPrice: bQty * boxPrice,
          });
        }
      }
    } else if (digitGroup === '2') {
      const modesToApply: TicketMode[] =
        actionType === 'ALL' ? ['AB', 'BC', 'AC'] : [actionType as TicketMode];

      for (const m of modesToApply) {
        const modePrice = getModeUnitPrice(m);
        for (const num of targetNumbers) {
          newItems.push({
            id: Math.random().toString(36).substring(2, 9),
            number: num,
            quantity: defaultQty,
            mode: m,
            isBox: false,
            unitPrice: modePrice,
            totalPrice: defaultQty * modePrice,
          });
        }
      }
    } else if (digitGroup === '1') {
      const modesToApply: TicketMode[] =
        actionType === 'ALL' ? ['A', 'B', 'C'] : [actionType as TicketMode];

      for (const m of modesToApply) {
        const modePrice = getModeUnitPrice(m);
        for (const num of targetNumbers) {
          newItems.push({
            id: Math.random().toString(36).substring(2, 9),
            number: num,
            quantity: defaultQty,
            mode: m,
            isBox: false,
            unitPrice: modePrice,
            totalPrice: defaultQty * modePrice,
          });
        }
      }
    }

    setEntries((prev) => [...prev, ...newItems]);

    // Clear inputs ready for next entry
    setNumberInput('');
    setCountInput('');
    setBoxCountInput('');
    setStartRangeInput('');
    setEndRangeInput('');
  };

  const handleRemoveEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleClearAll = () => {
    setEntries([]);
  };

  // Live Cutoff countdown helper
  const getCutoffInfo = () => {
    if (!selectedDraw?.cutoffTime) {
      return { closed: false, text: currentTimeStr, diffMs: 0 };
    }
    const cutoffDate = new Date(selectedDraw.cutoffTime);
    const now = new Date();
    const diffMs = cutoffDate.getTime() - now.getTime();

    if (diffMs <= 0) {
      return { closed: true, text: 'CLOSED', diffMs };
    }

    const totalSec = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    if (hours > 0) {
      return { closed: false, text: `${hours}h ${mins}m`, diffMs };
    }
    return {
      closed: false,
      text: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
      diffMs,
    };
  };

  const cutoffInfo = getCutoffInfo();

  // Totals calculations
  const totalCount = entries.reduce((acc, curr) => acc + curr.quantity, 0);
  const totalAmount = entries.reduce((acc, curr) => acc + curr.totalPrice, 0);

  // Core Submit logic
  const submitTicketEntries = async (itemsToSubmit: QueuedEntry[]) => {
    if (!selectedDraw) {
      Alert.alert('Error', 'Please select an active game draw');
      return;
    }
    if (cutoffInfo.closed) {
      Alert.alert(
        'Cutoff Passed',
        'Cutoff has passed for today for this game. You will be able to enter next tickets for tomorrow only after 12:00 AM.'
      );
      return;
    }
    if (itemsToSubmit.length === 0) {
      Alert.alert('Empty Ticket', 'Please add at least one ticket entry before saving');
      return;
    }

    setSubmitting(true);
    setLimitAlert(null);

    try {
      const payload = {
        drawId: selectedDraw.id,
        customerName: customerName.trim() || undefined,
        targetUserId: isAdmin && targetUserId ? targetUserId : undefined,
        entries: itemsToSubmit.map((e) => ({
          number: e.number,
          quantity: e.quantity,
          mode: e.mode,
          isBox: e.isBox,
        })),
        idempotencyKey: `app-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      };

      const result = await api.submitTicket(payload);
      if (isAdmin && targetUserId && !result.bookedFor) {
        result.bookedFor = usersList.find((u) => u.id === targetUserId)?.username;
      }
      setConfirmedTicket(result);
      setLastEnteredTicket(result);
      setEntries([]);
      setCustomerName('');
      setStartRangeInput('');
      setEndRangeInput('');
      setNumberInput('');
      setCountInput('');
      setBoxCountInput('');
    } catch (err: any) {
      if (err.data?.error === 'LimitExceededError' || err.message?.includes('maximum limit')) {
        setLimitAlert({
          number: err.data?.number || 'Specified number',
          maxQuantity: err.data?.maxQuantity || 0,
          currentlyAccepted: err.data?.currentlyAccepted || 0,
          requested: err.data?.requested || 0,
          remaining: err.data?.remaining || 0,
        });
      } else {
        Alert.alert('Submission Error', err.message || 'Failed to submit ticket');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditTicketFromEntry = (t: any) => {
    if (!t) return;
    if (t.status === 'CANCELLED') {
      Alert.alert('Cannot Edit', 'This ticket has been cancelled.');
      return;
    }
    setEditingTicket(t);
    setEditModalVisible(true);
    setConfirmedTicket(null);
  };

  const handleCancelTicketFromEntry = (t: any) => {
    if (!t) return;
    if (t.status === 'CANCELLED') {
      Alert.alert('Notice', 'Ticket is already cancelled.');
      return;
    }

    Alert.alert(
      'Cancel / Delete Ticket',
      `Are you sure you want to cancel Ticket #${t.ticket_number}? Number allocation will be released immediately.`,
      [
        { text: 'Keep Ticket', style: 'cancel' },
        {
          text: 'Yes, Delete Ticket',
          style: 'destructive',
          onPress: async () => {
            setCancellingLastTicket(true);
            try {
              await api.cancelTicket(t.ticket_number);
              Alert.alert('Deleted', `Ticket #${t.ticket_number} cancelled successfully.`);
              setConfirmedTicket(null);
              setLastEnteredTicket((prev: any) =>
                prev ? { ...prev, status: 'CANCELLED' } : null
              );
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel ticket');
            } finally {
              setCancellingLastTicket(false);
            }
          },
        },
      ]
    );
  };

  // Submit & Save Ticket from Header Save Button
  // Auto-expands pending Range or Number inputs if user hasn't clicked a mode button yet!
  const handleSaveTicket = () => {
    let itemsToSubmit = [...entries];

    // If Range inputs are filled and not yet added to queue
    if (isRange && startRangeInput.trim() && endRangeInput.trim()) {
      const s = parseInt(startRangeInput, 10);
      const e = parseInt(endRangeInput, 10);
      if (isNaN(s) || isNaN(e) || s > e) {
        Alert.alert('Invalid Range', 'Please enter a valid start and end number (e.g. 101 to 105)');
        return;
      }
      if (e - s + 1 > 500) {
        Alert.alert('Range Limit', 'Maximum 500 numbers allowed in a range');
        return;
      }

      const qty = parseInt(countInput, 10) || 1;
      const padLen = digitGroup === '1' ? 1 : digitGroup === '2' ? 2 : 3;
      const modeToUse = digitGroup === '3' ? 'SUPER' : digitGroup === '2' ? 'AB' : 'A';
      const unitPrice = getModeUnitPrice(modeToUse);
      const autoRangeItems: QueuedEntry[] = [];

      for (let i = s; i <= e; i++) {
        const numStr = String(i).padStart(padLen, '0');
        autoRangeItems.push({
          id: Math.random().toString(36).substring(2, 9),
          number: numStr,
          quantity: qty,
          mode: modeToUse,
          isBox: false,
          unitPrice,
          totalPrice: qty * unitPrice,
        });
      }
      itemsToSubmit = [...itemsToSubmit, ...autoRangeItems];
    } else if (!isRange && numberInput.trim()) {
      // If single number is filled and not yet added to queue
      const qty = parseInt(countInput, 10) || 1;
      const cleanNum = numberInput.trim();
      const requiredLen = digitGroup === '1' ? 1 : digitGroup === '2' ? 2 : 3;
      const formattedNum = cleanNum.padStart(requiredLen, '0');
      const targets = isSet ? getUniquePermutations(formattedNum) : [formattedNum];
      const mainMode = digitGroup === '3' ? 'SUPER' : digitGroup === '2' ? 'AB' : 'A';
      const mainUnitPrice = getModeUnitPrice(mainMode);
      const boxUnitPrice = getModeUnitPrice('BOX');
      const autoSingleItems: QueuedEntry[] = [];

      for (const num of targets) {
        autoSingleItems.push({
          id: Math.random().toString(36).substring(2, 9),
          number: num,
          quantity: qty,
          mode: mainMode,
          isBox: false,
          unitPrice: mainUnitPrice,
          totalPrice: qty * mainUnitPrice,
        });
        if (digitGroup === '3' && boxCountInput.trim()) {
          const bQty = parseInt(boxCountInput, 10) || qty;
          autoSingleItems.push({
            id: Math.random().toString(36).substring(2, 9),
            number: num,
            quantity: bQty,
            mode: 'BOX',
            isBox: true,
            unitPrice: boxUnitPrice,
            totalPrice: bQty * boxUnitPrice,
          });
        }
      }
      itemsToSubmit = [...itemsToSubmit, ...autoSingleItems];
    }

    if (itemsToSubmit.length === 0) {
      Alert.alert('Empty Ticket', 'Please enter a number or range and select mode before saving');
      return;
    }

    submitTicketEntries(itemsToSubmit);
  };

  const gameCode = getGameCode();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      {/* TOP HEADER CONTROLS (Green Container matching screenshot) */}
      <View style={styles.topControlContainer}>
        {/* Row 1: Back Button, Group Pill, Game Code Pill, Time Badge, Save Button */}
        <View style={styles.topHeaderRow}>
          {/* Back Button for smooth flow */}
          <TouchableOpacity
            style={styles.headerBackBtn}
            activeOpacity={0.8}
            onPress={onBack}
          >
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>

          {/* Digit Group Pill (1, 2, or 3) */}
          <TouchableOpacity
            style={styles.digitPill}
            activeOpacity={0.8}
            onPress={cycleDigitGroup}
          >
            <Text style={styles.digitPillText}>{digitGroup}</Text>
          </TouchableOpacity>

          {/* Game Code Pill (LSK3 / DEAR1 / etc.) */}
          <TouchableOpacity
            style={styles.gamePill}
            activeOpacity={0.8}
            onPress={() => setChooseTicketModalVisible(true)}
          >
            <Text style={styles.gamePillText}>{gameCode}</Text>
          </TouchableOpacity>

          {/* Time Badge (Live Countdown for Cutoff!) */}
          <View style={[styles.timeBadge, cutoffInfo.closed && styles.timeBadgeClosed]}>
            <Text style={styles.timeBadgeLabel}>
              {cutoffInfo.closed ? 'CUTOFF' : 'TIME LEFT'}
            </Text>
            <Text
              style={[styles.timeBadgeVal, cutoffInfo.closed && styles.timeBadgeValClosed]}
              numberOfLines={1}
            >
              {cutoffInfo.text}
            </Text>
          </View>

          {/* SAVE Action Button */}
          <TouchableOpacity
            style={[
              styles.saveBtn,
              (entries.length > 0 || (isRange && startRangeInput.trim() && endRangeInput.trim()) || (!isRange && numberInput.trim())) && !cutoffInfo.closed
                ? styles.saveBtnActive
                : styles.saveBtnDisabled,
            ]}
            activeOpacity={0.8}
            onPress={handleSaveTicket}
            disabled={submitting || cutoffInfo.closed}
          >
            {submitting ? (
              <ActivityIndicator color="#00A86B" size="small" />
            ) : (
              <Text
                style={[
                  styles.saveBtnText,
                  (entries.length > 0 || (isRange && startRangeInput.trim() && endRangeInput.trim()) || (!isRange && numberInput.trim())) && !cutoffInfo.closed
                    ? styles.saveBtnTextActive
                    : styles.saveBtnTextDisabled,
                ]}
              >
                SAVE
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Cutoff Warning Banner if Cutoff Passed */}
        {cutoffInfo.closed && (
          <View style={styles.cutoffWarningBanner}>
            <Clock size={16} color="#DC2626" />
            <Text style={styles.cutoffWarningText}>
              Cutoff passed for today. Bookings for tomorrow will open after 12:00 AM.
            </Text>
          </View>
        )}

        {/* ADMIN USER SELECTOR ROW (Book in the name of a user under admin) */}
        {isAdmin && (
          <View style={styles.adminUserSelectorRow}>
            <Text style={styles.adminUserSelectorLabel}>Seller / User:</Text>
            <TouchableOpacity
              style={styles.adminUserSelectorPill}
              activeOpacity={0.8}
              onPress={() => setUserPickerModalVisible(true)}
            >
              <Users size={15} color="#00A86B" />
              <Text style={styles.adminUserSelectorText} numberOfLines={1}>
                {targetUserId && usersList.find((u) => u.id === targetUserId)
                  ? `${usersList.find((u) => u.id === targetUserId)?.username} (${usersList.find((u) => u.id === targetUserId)?.role || 'USER'})`
                  : `Admin (Self: ${user?.username || 'Admin'})`}
              </Text>
              <ChevronDown size={15} color="#00A86B" />
            </TouchableOpacity>
          </View>
        )}

        {/* Row 2: Checkboxes [✓] Range  [ ] Set  [ ] 100  [ ] 111 matching screenshot */}
        <View style={styles.checkboxesRow}>
          <TouchableOpacity
            style={styles.checkboxItem}
            activeOpacity={0.7}
            onPress={() => setIsRange(!isRange)}
          >
            <View style={[styles.checkboxBox, isRange && styles.checkboxBoxChecked]}>
              {isRange && <Check size={14} color="#00A86B" strokeWidth={3} />}
            </View>
            <Text style={styles.checkboxLabel}>Range</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkboxItem}
            activeOpacity={0.7}
            onPress={() => setIsSet(!isSet)}
          >
            <View style={[styles.checkboxBox, isSet && styles.checkboxBoxChecked]}>
              {isSet && <Check size={14} color="#00A86B" strokeWidth={3} />}
            </View>
            <Text style={styles.checkboxLabel}>Set</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkboxItem}
            activeOpacity={0.7}
            onPress={() => setIs100(!is100)}
          >
            <View style={[styles.checkboxBox, is100 && styles.checkboxBoxChecked]}>
              {is100 && <Check size={14} color="#00A86B" strokeWidth={3} />}
            </View>
            <Text style={styles.checkboxLabel}>100</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkboxItem}
            activeOpacity={0.7}
            onPress={() => setIs111(!is111)}
          >
            <View style={[styles.checkboxBox, is111 && styles.checkboxBoxChecked]}>
              {is111 && <Check size={14} color="#00A86B" strokeWidth={3} />}
            </View>
            <Text style={styles.checkboxLabel}>111</Text>
          </TouchableOpacity>
        </View>

        {/* Row 3: Inputs:
            If Range is checked: [ Start ] [ End ] [ Count ] [ PASTE ]
            If Range is not checked: [ Number ] [ Count ] [ Box ] [ PASTE ] */}
        {isRange ? (
          <View style={styles.inputsRow}>
            <TextInput
              style={[styles.inputBox, { flex: 1 }]}
              placeholder="Start"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={startRangeInput}
              onChangeText={setStartRangeInput}
            />
            <TextInput
              style={[styles.inputBox, { flex: 1 }]}
              placeholder="End"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={endRangeInput}
              onChangeText={setEndRangeInput}
            />
            <TextInput
              style={[styles.inputBox, { flex: 1 }]}
              placeholder="Count"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={countInput}
              onChangeText={setCountInput}
            />
            <TouchableOpacity
              style={styles.quickPasteColBtn}
              activeOpacity={0.8}
              onPress={handleMessageButtonClick}
            >
              <ClipboardPaste size={15} color="#00A86B" strokeWidth={2.5} />
              <Text style={styles.quickPasteColBtnText}>PASTE</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inputsRow}>
            {/* Number Input */}
            <TextInput
              ref={numberInputRef}
              style={[styles.inputBox, { flex: digitGroup === '3' ? 1.15 : 1.3 }]}
              placeholder="Number"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={numberInput}
              onChangeText={handleNumberChange}
              returnKeyType="next"
              onSubmitEditing={() => countInputRef.current?.focus()}
            />

            {/* Count Input */}
            <TextInput
              ref={countInputRef}
              style={[styles.inputBox, { flex: 1 }]}
              placeholder="Count"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={countInput}
              onChangeText={setCountInput}
              returnKeyType={digitGroup === '3' ? 'next' : 'done'}
              onSubmitEditing={() => {
                if (digitGroup === '3') {
                  boxInputRef.current?.focus();
                } else {
                  handleModeButtonClick('ALL');
                }
              }}
            />

            {/* Box Rectangle Input */}
            {digitGroup === '3' && (
              <TextInput
                ref={boxInputRef}
                style={[styles.inputBox, { flex: 1 }]}
                placeholder="Box"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={boxCountInput}
                onChangeText={setBoxCountInput}
                returnKeyType="done"
                onSubmitEditing={() => {
                  handleModeButtonClick(boxCountInput.trim() ? 'ALL' : 'SUPER');
                }}
              />
            )}

            {/* Dedicated PASTE Button */}
            <TouchableOpacity
              style={styles.quickPasteColBtn}
              activeOpacity={0.8}
              onPress={handleMessageButtonClick}
            >
              <ClipboardPaste size={15} color="#00A86B" strokeWidth={2.5} />
              <Text style={styles.quickPasteColBtnText}>PASTE</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Row 4: Name Input (Full width) */}
        <TextInput
          style={styles.nameInputBox}
          placeholder="Name"
          placeholderTextColor="#94A3B8"
          value={customerName}
          onChangeText={setCustomerName}
        />

        {/* Row 5: Action Mode Buttons */}
        <View style={styles.modeButtonsRow}>
          {digitGroup === '1' && (
            <>
              <TouchableOpacity
                style={[styles.modeBtn, { backgroundColor: '#00C853' }]}
                activeOpacity={0.85}
                onPress={() => handleModeButtonClick('A')}
              >
                <Text style={styles.modeBtnText}>{gameCode}-A</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, { backgroundColor: '#FF2D87' }]}
                activeOpacity={0.85}
                onPress={() => handleModeButtonClick('B')}
              >
                <Text style={styles.modeBtnText}>{gameCode}-B</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, { backgroundColor: '#FF5722' }]}
                activeOpacity={0.85}
                onPress={() => handleModeButtonClick('C')}
              >
                <Text style={styles.modeBtnText}>{gameCode}-C</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, { backgroundColor: '#2196F3' }]}
                activeOpacity={0.85}
                onPress={() => handleModeButtonClick('ALL')}
              >
                <Text style={styles.modeBtnText}>ALL</Text>
              </TouchableOpacity>
            </>
          )}

          {digitGroup === '2' && (
            <>
              <TouchableOpacity
                style={[styles.modeBtn, { backgroundColor: '#00C853' }]}
                activeOpacity={0.85}
                onPress={() => handleModeButtonClick('AB')}
              >
                <Text style={styles.modeBtnText}>{gameCode}-AB</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, { backgroundColor: '#FF2D87' }]}
                activeOpacity={0.85}
                onPress={() => handleModeButtonClick('BC')}
              >
                <Text style={styles.modeBtnText}>{gameCode}-BC</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, { backgroundColor: '#FF5722' }]}
                activeOpacity={0.85}
                onPress={() => handleModeButtonClick('AC')}
              >
                <Text style={styles.modeBtnText}>{gameCode}-AC</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, { backgroundColor: '#2196F3' }]}
                activeOpacity={0.85}
                onPress={() => handleModeButtonClick('ALL')}
              >
                <Text style={styles.modeBtnText}>ALL</Text>
              </TouchableOpacity>
            </>
          )}

          {digitGroup === '3' && (
            <>
              <TouchableOpacity
                style={[styles.modeBtn, { backgroundColor: '#00C853', flex: 1.2 }]}
                activeOpacity={0.85}
                onPress={() => handleModeButtonClick('SUPER')}
              >
                <Text style={styles.modeBtnText}>{gameCode}-SUPER</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, { backgroundColor: '#FF2D87', flex: 1 }]}
                activeOpacity={0.85}
                onPress={() => handleModeButtonClick('BOX')}
              >
                <Text style={styles.modeBtnText}>{gameCode.startsWith('LSK') ? 'LSK-BOX' : `${gameCode}-BOX`}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, { backgroundColor: '#FF5722', flex: 1 }]}
                activeOpacity={0.85}
                onPress={() => handleModeButtonClick('ALL')}
              >
                <Text style={styles.modeBtnText}>ALL</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* SUB-HEADER SUMMARY BAR (Light green bar from screenshot) */}
      <View style={styles.subSummaryBar}>
        <Text style={styles.subSummaryText}>Count: {totalCount}</Text>
        <Text style={styles.subSummaryText}>Total Collect: {totalAmount}</Text>
      </View>

      {/* LAST ENTERED TICKET QUICK EDIT/DELETE BAR */}
      {lastEnteredTicket && (
        <View style={styles.lastTicketBanner}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.lastTicketTitle}>
                Last Ticket: #{lastEnteredTicket.ticket_number}
              </Text>
              <View
                style={[
                  styles.lastTicketStatusBadge,
                  lastEnteredTicket.status === 'CANCELLED'
                    ? styles.lastTicketStatusBadgeCancelled
                    : styles.lastTicketStatusBadgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.lastTicketStatusText,
                    lastEnteredTicket.status === 'CANCELLED'
                      ? { color: '#DC2626' }
                      : { color: '#059669' },
                  ]}
                >
                  {lastEnteredTicket.status || 'ACTIVE'}
                </Text>
              </View>
            </View>
            <Text style={styles.lastTicketMeta}>
              Qty: {lastEnteredTicket.total_quantity} • ₹{lastEnteredTicket.total_amount}
            </Text>
          </View>

          {lastEnteredTicket.status !== 'CANCELLED' && (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                style={styles.lastTicketEditBtn}
                onPress={() => handleEditTicketFromEntry(lastEnteredTicket)}
              >
                <Edit3 size={13} color="#2563EB" />
                <Text style={styles.lastTicketEditText}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.lastTicketDeleteBtn}
                onPress={() => handleCancelTicketFromEntry(lastEnteredTicket)}
                disabled={cancellingLastTicket}
              >
                <Trash2 size={13} color="#DC2626" />
                <Text style={styles.lastTicketDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* QUEUED TICKETS LIST */}
      <ScrollView contentContainerStyle={styles.entriesListContent} showsVerticalScrollIndicator={false}>
        {entries.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No Tickets Added</Text>
            <Text style={styles.emptyStateSubtitle}>
              Enter number, count (and box), then tap a mode button to queue entries.
            </Text>
          </View>
        ) : (
          entries.map((item, idx) => (
            <View key={item.id} style={styles.entryCard}>
              <View style={styles.entryCardLeft}>
                <View style={styles.entryNumBadge}>
                  <Text style={styles.entryNumText}>{item.number}</Text>
                </View>
                <View style={styles.entryMetaCol}>
                  <View style={styles.entryModeRow}>
                    <Text
                      style={[
                        styles.entryModeTag,
                        item.mode === 'BOX'
                          ? { backgroundColor: '#FCE7F3', color: '#BE185D' }
                          : item.mode === 'SUPER'
                          ? { backgroundColor: '#DCFCE7', color: '#15803D' }
                          : { backgroundColor: '#E0F2FE', color: '#0369A1' },
                      ]}
                    >
                      {item.mode}
                    </Text>
                    <Text style={styles.entryQtyText}>x{item.quantity} qty</Text>
                  </View>
                </View>
              </View>

              <View style={styles.entryCardRight}>
                <Text style={styles.entryPriceText}>₹{item.totalPrice}</Text>
                <TouchableOpacity
                  style={styles.entryDeleteBtn}
                  onPress={() => handleRemoveEntry(item.id)}
                >
                  <Trash2 size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* BOTTOM FOOTER SECTION (Summary row + 4 Bottom Buttons from screenshot) */}
      <View style={styles.bottomFooterContainer}>
        {/* Summary row */}
        <View style={styles.bottomSummaryRow}>
          <Text style={styles.bottomSummaryText}>Count: {totalCount}</Text>
          <Text style={styles.bottomSummaryText}>Total Pay: {totalAmount.toFixed(2)}</Text>
        </View>

        {/* 4 Bottom Action Buttons matching screenshot */}
        <View style={styles.bottomButtonsRow}>
          {/* CLEAR */}
          <TouchableOpacity
            style={[styles.bottomBtn, { backgroundColor: '#6C757D' }]}
            activeOpacity={0.8}
            onPress={handleClearAll}
          >
            <Text style={styles.bottomBtnText}>CLEAR</Text>
          </TouchableOpacity>

          {/* MENU (Navigates Back) */}
          <TouchableOpacity
            style={[styles.bottomBtn, { backgroundColor: '#E53935' }]}
            activeOpacity={0.8}
            onPress={onBack}
          >
            <Text style={styles.bottomBtnText}>MENU</Text>
          </TouchableOpacity>

          {/* Message (WhatsApp/Chat - Clipboard Paste) */}
          <TouchableOpacity
            style={[styles.bottomBtn, { backgroundColor: '#00897B' }]}
            activeOpacity={0.8}
            onPress={handleMessageButtonClick}
          >
            <View style={styles.btnIconRow}>
              <ClipboardPaste size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.bottomBtnText}>Paste / Msg</Text>
            </View>
          </TouchableOpacity>

          {/* Camera */}
          <TouchableOpacity
            style={[styles.bottomBtn, { backgroundColor: '#1E88E5' }]}
            activeOpacity={0.8}
            onPress={() => {
              Alert.alert('Camera', 'Scanner / OCR mode ready.');
            }}
          >
            <View style={styles.btnIconRow}>
              <Camera size={16} color="#FFFFFF" />
              <Text style={styles.bottomBtnText}>Camera</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* 1. CHOOSE TICKET MODAL POPUP (Exact replica of Screenshot 2) */}
      <Modal
        visible={chooseTicketModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setChooseTicketModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setChooseTicketModalVisible(false)}
        >
          <View style={styles.chooseTicketCard}>
            <Text style={styles.chooseTicketTitle}>Choose Ticket</Text>
            <View style={styles.chooseTicketBar} />

            <View style={styles.gamesListContainer}>
              {games.map((g) => {
                const cardColor = getGameCardColor(g.name);
                const subtitle = getGameSubtitle(g.name);

                return (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.gameSelectCard, { backgroundColor: cardColor }]}
                    activeOpacity={0.85}
                    onPress={() => selectGame(g)}
                  >
                    <View>
                      <Text style={styles.gameSelectSubtitle}>{subtitle}</Text>
                      <Text style={styles.gameSelectTitle}>{g.name}</Text>
                    </View>
                    <ChevronRight size={22} color="#FFFFFF" strokeWidth={2.5} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 2. CONFIRMED TICKET RECEIPT MODAL */}
      <Modal visible={!!confirmedTicket} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.receiptModal}>
            <View style={styles.receiptTopIcon}>
              <CheckCircle2 size={44} color="#00C853" />
            </View>
            <Text style={styles.receiptTitle}>Ticket Confirmed!</Text>
            <Text style={styles.receiptTicketNum}>{confirmedTicket?.ticket_number}</Text>

            <View style={styles.receiptDivider} />

            <View style={styles.receiptMetaRow}>
              <Text style={styles.receiptMetaLabel}>Game:</Text>
              <Text style={styles.receiptMetaVal}>{selectedGame?.name}</Text>
            </View>
            <View style={styles.receiptMetaRow}>
              <Text style={styles.receiptMetaLabel}>Draw Time:</Text>
              <Text style={styles.receiptMetaVal}>{selectedDraw?.drawTime || 'Next Draw'}</Text>
            </View>
            <View style={styles.receiptMetaRow}>
              <Text style={styles.receiptMetaLabel}>Total Quantity:</Text>
              <Text style={styles.receiptMetaVal}>{confirmedTicket?.total_quantity} units</Text>
            </View>
            <View style={styles.receiptMetaRow}>
              <Text style={styles.receiptMetaLabel}>Total Price:</Text>
              <Text style={[styles.receiptMetaVal, { color: '#00C853', fontWeight: '800' }]}>
                ₹{confirmedTicket?.total_amount}
              </Text>
            </View>
            {confirmedTicket?.customer_name && (
              <View style={styles.receiptMetaRow}>
                <Text style={styles.receiptMetaLabel}>Customer:</Text>
                <Text style={styles.receiptMetaVal}>{confirmedTicket.customer_name}</Text>
              </View>
            )}
            {confirmedTicket?.bookedFor && (
              <View style={styles.receiptMetaRow}>
                <Text style={styles.receiptMetaLabel}>Booked For:</Text>
                <Text style={[styles.receiptMetaVal, { color: '#2563EB', fontWeight: '800' }]}>
                  {confirmedTicket.bookedFor}
                </Text>
              </View>
            )}

            {/* Quick Actions on Confirmed Ticket within time limit: Edit & Delete */}
            <View style={styles.receiptActionButtonsRow}>
              <TouchableOpacity
                style={styles.receiptEditBtn}
                activeOpacity={0.85}
                onPress={() => handleEditTicketFromEntry(confirmedTicket)}
              >
                <Edit3 size={15} color="#FFFFFF" />
                <Text style={styles.receiptActionBtnText}>Edit Ticket</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.receiptDeleteBtn}
                activeOpacity={0.85}
                onPress={() => handleCancelTicketFromEntry(confirmedTicket)}
                disabled={cancellingLastTicket}
              >
                <Trash2 size={15} color="#FFFFFF" />
                <Text style={styles.receiptActionBtnText}>Delete Ticket</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.receiptDoneBtn}
              activeOpacity={0.85}
              onPress={() => setConfirmedTicket(null)}
            >
              <Text style={styles.receiptDoneBtnText}>Done / New Ticket</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 2b. EDIT TICKET MODAL */}
      <EditTicketModal
        visible={editModalVisible}
        ticket={editingTicket}
        onClose={() => {
          setEditModalVisible(false);
          setEditingTicket(null);
        }}
        onSuccess={(updated) => {
          setLastEnteredTicket(updated);
        }}
        userPrices={userPrices}
      />

      {/* 3. CAPACITY / LIMIT EXCEEDED ALERT */}
      <Modal visible={!!limitAlert} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.limitAlertBox}>
            <AlertTriangle size={36} color="#DC2626" />
            <Text style={styles.limitAlertTitle}>Booking Limit Exceeded</Text>
            <Text style={styles.limitAlertDesc}>
              Number <Text style={{ fontWeight: '800' }}>{limitAlert?.number}</Text> has reached maximum allocation limit.
            </Text>
            <View style={styles.limitDetailCard}>
              <Text style={styles.limitDetailRow}>Max Limit: {limitAlert?.maxQuantity}</Text>
              <Text style={styles.limitDetailRow}>Already Accepted: {limitAlert?.currentlyAccepted}</Text>
              <Text style={styles.limitDetailRow}>Remaining Available: {limitAlert?.remaining}</Text>
            </View>
            <TouchableOpacity
              style={styles.limitAlertCloseBtn}
              onPress={() => setLimitAlert(null)}
            >
              <Text style={styles.limitAlertCloseText}>OK, Adjust Quantity</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* MESSAGE / WHATSAPP PASTE MODAL */}
      <Modal
        visible={messageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMessageModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.messageModalCard}>
            <View style={styles.messageModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MessageCircle size={20} color="#00897B" />
                <Text style={styles.messageModalTitle}>Paste WhatsApp / Orders</Text>
              </View>
              <TouchableOpacity
                onPress={() => setMessageModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.messageModalSubtitle}>
              Paste WhatsApp text or customer tickets formatted like:
            </Text>
            <View style={styles.messageExampleBox}>
              <Text style={styles.messageExampleText}>• 551-5-5  → 551, 5 SUPER, 5 BOX</Text>
              <Text style={styles.messageExampleText}>• 551-2    → 551, 2 SUPER</Text>
              <Text style={styles.messageExampleText}>• 24-2     → 24, 2 QTY</Text>
            </View>

            <TextInput
              style={styles.messageModalInput}
              placeholder="Paste or type clipboard text here...&#10;e.g.&#10;551-5-5&#10;551-2&#10;24-2"
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={4}
              value={messagePasteInput}
              onChangeText={setMessagePasteInput}
              autoFocus
            />

            <View style={styles.messageModalButtonsRow}>
              <TouchableOpacity
                style={styles.messageModalCancelBtn}
                onPress={() => setMessageModalVisible(false)}
              >
                <Text style={styles.messageModalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.messageModalReadClipBtn}
                onPress={async () => {
                  try {
                    let text = await Clipboard.getStringAsync();
                    if (!text && typeof navigator !== 'undefined' && (navigator as any).clipboard) {
                      try {
                        text = await (navigator as any).clipboard.readText();
                      } catch {}
                    }
                    if (text) setMessagePasteInput(text);
                  } catch {}
                }}
              >
                <ClipboardPaste size={15} color="#0369A1" />
                <Text style={styles.messageModalReadClipText}>Read Clip</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.messageModalApplyBtn}
                onPress={() => {
                  if (!messagePasteInput.trim()) {
                    Alert.alert('Empty Input', 'Please paste or enter message text');
                    return;
                  }
                  const parsed = parseClipboardTicketData(messagePasteInput);
                  if (parsed.length === 0) {
                    Alert.alert('No Tickets Found', 'Could not find ticket patterns like 551-5-5 or 551-2 in the text.');
                    return;
                  }
                  setMessageModalVisible(false);
                  applyParsedTickets(parsed);
                }}
              >
                <Text style={styles.messageModalApplyText}>Paste into Columns</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ADMIN USER PICKER MODAL */}
      <Modal
        visible={userPickerModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUserPickerModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setUserPickerModalVisible(false)}
        >
          <View style={styles.userPickerModalCard}>
            <View style={styles.userPickerModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Users size={20} color="#00A86B" />
                <Text style={styles.userPickerModalTitle}>Select Seller / User</Text>
              </View>
              <TouchableOpacity onPress={() => setUserPickerModalVisible(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.userPickerModalSubtitle}>
              Select a user under admin to book tickets and apply rates in their name:
            </Text>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {/* Option 1: Admin Self */}
              <TouchableOpacity
                style={[
                  styles.userPickerOption,
                  (!targetUserId || targetUserId === user?.id) && styles.userPickerOptionSelected,
                ]}
                onPress={() => handleSelectTargetUser('')}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.userPickerOptionTitle}>
                    Admin (Self: {user?.username})
                  </Text>
                  <Text style={styles.userPickerOptionSub}>
                    Direct admin entry (admin account & pricing)
                  </Text>
                </View>
                {(!targetUserId || targetUserId === user?.id) && (
                  <Check size={18} color="#00A86B" strokeWidth={2.5} />
                )}
              </TouchableOpacity>

              {/* Option 2+: Users under Admin */}
              {usersList.map((u) => {
                const isSelected = targetUserId === u.id;
                return (
                  <TouchableOpacity
                    key={u.id}
                    style={[
                      styles.userPickerOption,
                      isSelected && styles.userPickerOptionSelected,
                    ]}
                    onPress={() => handleSelectTargetUser(u.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userPickerOptionTitle}>
                        {u.username} {u.name ? `• ${u.name}` : ''}
                      </Text>
                      <Text style={styles.userPickerOptionSub}>
                        Role: {u.role || 'USER'} {u.phone ? `• ${u.phone}` : ''}
                      </Text>
                    </View>
                    {isSelected && (
                      <Check size={18} color="#00A86B" strokeWidth={2.5} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#00A86B',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 28 : 52) : 36,
  },
  topControlContainer: {
    backgroundColor: '#00A86B',
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 16,
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    marginBottom: 12,
  },
  headerBackBtn: {
    width: 40,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitPill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 46,
    width: 46,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  digitPillText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#00A86B',
  },
  gamePill: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  gamePillText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#00A86B',
  },
  timeBadge: {
    backgroundColor: '#006945',
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  timeBadgeClosed: {
    backgroundColor: '#991B1B',
  },
  timeBadgeLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  timeBadgeVal: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  timeBadgeValClosed: {
    color: '#FEE2E2',
    fontWeight: '900',
  },
  cutoffWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  cutoffWarningText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  saveBtn: {
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  saveBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  saveBtnTextDisabled: {
    color: 'rgba(255,255,255,0.7)',
  },
  saveBtnTextActive: {
    color: '#00A86B',
  },
  checkboxesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: '#FFFFFF',
  },
  checkboxLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  adminUserSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 12,
  },
  adminUserSelectorLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  adminUserSelectorPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  adminUserSelectorText: {
    flex: 1,
    marginHorizontal: 6,
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  quickPasteColBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  quickPasteColBtnText: {
    color: '#00A86B',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  inputBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '600',
  },
  nameInputBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    height: 42,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 10,
  },
  modeButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  modeBtn: {
    flex: 1,
    height: 40,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  subSummaryBar: {
    backgroundColor: '#D4EDDA',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#C3E6CB',
  },
  subSummaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  entriesListContent: {
    flexGrow: 1,
    backgroundColor: '#F8FAFC',
    padding: 12,
    paddingBottom: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#94A3B8',
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 30,
  },
  entryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  entryCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  entryNumBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  entryNumText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  entryMetaCol: {},
  entryModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  entryModeTag: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  entryQtyText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  entryCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  entryPriceText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#00A86B',
  },
  entryDeleteBtn: {
    padding: 6,
  },
  bottomFooterContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
  },
  bottomSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  bottomSummaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  bottomButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bottomBtn: {
    flex: 1,
    height: 44,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bottomBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  chooseTicketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  chooseTicketTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  chooseTicketBar: {
    width: 44,
    height: 4,
    backgroundColor: '#6366F1',
    borderRadius: 2,
    marginBottom: 20,
  },
  gamesListContainer: {
    width: '100%',
    gap: 12,
  },
  gameSelectCard: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gameSelectSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  gameSelectTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  receiptModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  receiptTopIcon: {
    marginBottom: 12,
  },
  receiptTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  receiptTicketNum: {
    fontSize: 16,
    fontWeight: '800',
    color: '#00A86B',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  receiptDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 16,
  },
  receiptMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 4,
  },
  receiptMetaLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  receiptMetaVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  receiptDoneBtn: {
    backgroundColor: '#00A86B',
    width: '100%',
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  receiptDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  receiptActionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 18,
  },
  receiptEditBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 10,
  },
  receiptDeleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    borderRadius: 10,
  },
  receiptActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  lastTicketBanner: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastTicketTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  lastTicketStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lastTicketStatusBadgeActive: {
    backgroundColor: '#ECFDF5',
  },
  lastTicketStatusBadgeCancelled: {
    backgroundColor: '#FEF2F2',
  },
  lastTicketStatusText: {
    fontSize: 9,
    fontWeight: '800',
  },
  lastTicketMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  lastTicketEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  lastTicketEditText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '700',
  },
  lastTicketDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  lastTicketDeleteText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '700',
  },
  limitAlertBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  limitAlertTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#DC2626',
    marginTop: 10,
  },
  limitAlertDesc: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginTop: 6,
  },
  limitDetailCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 10,
    width: '100%',
    marginVertical: 12,
    gap: 4,
  },
  limitDetailRow: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '600',
  },
  limitAlertCloseBtn: {
    backgroundColor: '#DC2626',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  limitAlertCloseText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  // MESSAGE PASTE MODAL STYLES
  messageModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 380,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
  messageModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  messageModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  messageModalSubtitle: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 8,
  },
  messageExampleBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    gap: 3,
  },
  messageExampleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803D',
  },
  messageModalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  messageModalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  messageModalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  messageModalCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  messageModalApplyBtn: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#00897B',
    alignItems: 'center',
  },
  messageModalApplyText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  messageModalReadClipBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageModalReadClipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1',
  },
  userPickerModalCard: {
    width: '90%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
  userPickerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  userPickerModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  userPickerModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
  },
  userPickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  userPickerOptionSelected: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  userPickerOptionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  userPickerOptionSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
});
