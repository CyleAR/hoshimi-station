'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================
// Section icons & styles for file types
// ============================================================
const SECTION_CONFIG = {
  // Card / Character specific
  profile: { icon: '👤', label: '프로필 정보', color: '#38bdf8' },
  card: { icon: '🃏', label: '카드 정보', color: '#60a5fa' },
  costume: { icon: '👗', label: '의상', color: '#ec4899' },
  skills: { icon: '⚡', label: '스킬', color: '#f59e0b' },
  stories: { icon: '📖', label: '스토리', color: '#8b5cf6' },
  messages: { icon: '💬', label: '메시지', color: '#10b981' },
  homeTalks: { icon: '🏠', label: '홈 대사', color: '#06b6d4' },
  callPatterns: { icon: '📞', label: '접속 대사', color: '#f97316' },
  evolutionMessages: { icon: '🌸', label: '개화 대사', color: '#ec4899' },
  telephones: { icon: '📱', label: '전화', color: '#a855f7' },
  companyStories: { icon: '🏢', label: '사무소 스토리', color: '#f472b6' },
  
  // Group chats
  groupChatMessages: { icon: '👥', label: '그룹 채팅 문자', color: '#10b981' },
  groupChatTelephones: { icon: '📞', label: '그룹 통화', color: '#a855f7' },

  // Events & Stories specific
  info: { icon: 'ℹ️', label: '기본 정보', color: '#60a5fa' },
  adv: { icon: '🎬', label: 'ADV 스크립트', color: '#8b5cf6' }
};

export default function HomePage() {
  // Navigation & Category states (defaulting to primary 'characters')
  const [category, setCategory] = useState('characters'); 
  const [items, setItems] = useState([]);
  const [charactersList, setCharactersList] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemDeps, setItemDeps] = useState(null);
  
  // Hierarchical Collapsible states
  const [expandedCards, setExpandedCards] = useState({});
  const [expandedNonCard, setExpandedNonCard] = useState({
    messages: true,
    telephones: true,
    hometalks: true,
    stories: true
  });
  
  // Selected leaf node in the middle panel
  const [activeSection, setActiveSection] = useState(null);
  
  // Global search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGroup, setFilterGroup] = useState(''); // e.g. LizNoir, Moon Tempest
  const [loading, setLoading] = useState(true);
  const [loadingDeps, setLoadingDeps] = useState(false);
  const [advEditorData, setAdvEditorData] = useState(null);
  const [advLoading, setAdvLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const searchRef = useRef(null);

  // Fetch Sidebar Items
  const fetchItems = async () => {
    setLoading(true);
    setFetchError(null);
    setItems([]);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      
      const queryString = params.toString();
      const url = `/api/${category}${queryString ? '?' + queryString : ''}`;
      
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      
      let filteredData = data;
      if (category === 'characters') {
        // Character specific group filtering
        if (filterGroup) {
          filteredData = data.filter(c => c.groupName === filterGroup);
        }
      } else if (category === 'cards') {
        filteredData = data.cards || [];
        setCharactersList(data.characters || []);
      } else {
        // Search filter fallback for simple lists
        if (searchQuery) {
          const lowerQ = searchQuery.toLowerCase();
          filteredData = data.filter(d => 
            d.name?.toLowerCase().includes(lowerQ) || 
            d.id?.toLowerCase().includes(lowerQ) ||
            d.assetId?.toLowerCase().includes(lowerQ)
          );
        }
      }
      setItems(filteredData || []);
    } catch (err) {
      console.error(`Failed to fetch ${category}:`, err);
      setFetchError(err.message || 'Failed to fetch');
    }
    setLoading(false);
  };

  // Trigger sidebar fetch on search or category changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchItems();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, filterGroup, category]);

  // Load detailed dependencies for the clicked sidebar item
  const selectItem = useCallback(async (item) => {
    setSelectedItem(item);
    setActiveSection(null);
    setAdvEditorData(null);
    setExpandedCards({});
    setLoadingDeps(true);
    try {
      const idToFetch = category === 'cards' ? item.assetId : item.id;
      const res = await fetch(`/api/${category}/${idToFetch}`, { cache: 'no-store' });
      const data = await res.json();
      setItemDeps(data);
      
      // Auto-select first meaningful section for instant productivity
      if (category === 'characters') {
        setActiveSection({ type: 'profile' });
      } else if (category === 'groupchats') {
        setActiveSection({ type: 'groupChatMessages' });
      } else if (category === 'cards') {
        setActiveSection({ type: 'card' });
      } else {
        setActiveSection('info');
      }
    } catch (err) {
      console.error(`Failed to fetch ${category} details:`, err);
    }
    setLoadingDeps(false);
  }, [category]);

  // Toggle collapsible card node in the character tree view
  const toggleCardExpand = (cardId) => {
    setExpandedCards(prev => ({
      ...prev,
      [cardId]: !prev[cardId]
    }));
  };

  // Toggle other collapsible tree branches
  const toggleNonCardExpand = (branch) => {
    setExpandedNonCard(prev => ({
      ...prev,
      [branch]: !prev[branch]
    }));
  };

  // Get active translation editor fields based on selection state
  const getEditorEntries = () => {
    if (!itemDeps || !activeSection || itemDeps.error) return [];
    const entries = [];

    // 1. Simple Flat UI sections (cards, events, stories, extras, generic)
    if (typeof activeSection === 'string') {
      if (activeSection === 'info' && itemDeps.dependencies?.info) {
        return itemDeps.dependencies.info.map(info => ({
          id: info.id, label: info.type, original: info.original
        }));
      }
      if (activeSection === 'adv' && itemDeps.dependencies?.adv) {
        return itemDeps.dependencies.adv.map(adv => ({
          id: `adv|${adv.fileName}`, label: adv.type || 'ADV', original: adv.fileName, isFile: true, exists: adv.exists
        }));
      }

      // Legacy fallback card categories
      switch (activeSection) {
        case 'card':
          if (itemDeps.card) {
            entries.push(
              { id: `${itemDeps.card.id}|name`, label: '카드명', original: itemDeps.card.name },
              { id: `${itemDeps.card.id}|description`, label: '설명 (글귀)', original: itemDeps.card.description },
              { id: `${itemDeps.card.id}|obtainMessage`, label: '획득 메시지', original: itemDeps.card.obtainMessage }
            );
          }
          break;
        case 'costume':
          if (itemDeps.costume) {
            entries.push({ id: `${itemDeps.costume.id}|name`, label: '의상명', original: itemDeps.costume.name });
          }
          break;
        case 'skills':
          (itemDeps.skills || []).forEach(sk => {
            entries.push({ id: `${sk.id}|name`, label: `스킬명`, original: sk.name });
            (sk.levels || []).forEach(lvl => {
              entries.push({ id: `${sk.id}|level.${lvl.level}.description`, label: `Lv.${lvl.level} 설명`, original: lvl.description });
            });
          });
          break;
        case 'stories':
          (itemDeps.stories || []).forEach(st => {
            entries.push({ id: `${st.id}|name`, label: '에피소드 제목', original: st.name });
            if (st.description) entries.push({ id: `${st.id}|description`, label: '에피소드 설명', original: st.description });
            (st.advFiles || []).forEach(adv => {
              entries.push({ id: `adv|${adv.filename}`, label: `ADV 스크립트`, original: adv.filename, isFile: true, exists: adv.exists });
            });
          });
          break;
        case 'messages':
          (itemDeps.messages || []).forEach(group => {
            (group.details || []).forEach(d => {
              entries.push({ id: `${group.id}|detail.${d.messageDetailId}.text`, label: `[${d.messageDetailId}]`, original: d.text });
              if (d.choiceText) entries.push({ id: `${group.id}|detail.${d.messageDetailId}.choiceText`, label: `[${d.messageDetailId}] 선택지`, original: d.choiceText });
            });
          });
          break;
        case 'homeTalks':
          (itemDeps.homeTalks || []).forEach(ht => {
            if (ht.choiceText) entries.push({ id: `${ht.id}|choiceText`, label: '선택지', original: ht.choiceText });
            if (ht.managerText) entries.push({ id: `${ht.id}|managerText`, label: '매니저 텍스트', original: ht.managerText });
            (ht.characterTalks || []).forEach((ct, i) => {
              entries.push({ id: `${ht.id}|talk.${i}`, label: `대사 ${i + 1}`, original: ct.text });
            });
          });
          break;
        case 'callPatterns':
          (itemDeps.callPatterns || []).forEach(cp => {
            entries.push(
              { id: `${cp.patternId}|characterArrivalText`, label: '캐릭터 대사', original: cp.characterArrivalText },
              { id: `${cp.patternId}|managerCallText`, label: '매니저 대사', original: cp.managerCallText }
            );
          });
          break;
        case 'evolutionMessages':
          (itemDeps.evolutionMessages || []).forEach(em => {
            entries.push({ id: `${em.cardId}|evo.${em.evolutionLevel}.${em.number}`, label: `개화 ${em.evolutionLevel} - ${em.number}`, original: em.evolveMessage });
          });
          break;
        case 'telephones':
          (itemDeps.telephones || []).forEach(tel => {
            entries.push({ id: `${tel.id}|name`, label: '전화', original: tel.name || tel.id });
          });
          break;
      }
      return entries.filter(e => e.original);
    }

    // 2. Structured selection (Characters & Group Chats)
    const { type, subType, cardIndex, storyId } = activeSection;

    // Profile Info
    if (type === 'profile' && itemDeps.profile) {
      const p = itemDeps.profile;
      entries.push(
        { id: `char_profile_name_${itemDeps.id}`, label: '아이돌명', original: p.name },
        { id: `char_profile_cv_${itemDeps.id}`, label: '성우 (CV)', original: p.cv },
        { id: `char_profile_favorite_${itemDeps.id}`, label: '좋아하는 것', original: p.favorite },
        { id: `char_profile_unfavorite_${itemDeps.id}`, label: '싫어하는 것', original: p.unfavorite },
        { id: `char_profile_text_${itemDeps.id}`, label: '자기소개 프로필', original: p.profileText },
        { id: `char_profile_short_${itemDeps.id}`, label: '한줄 소개', original: p.shortProfile },
        { id: `char_profile_catchphrase_${itemDeps.id}`, label: '캐치프레이즈', original: p.catchphrase }
      );
      (p.activityFanEventWords || []).forEach((w, i) => {
        entries.push({ id: `char_fan_word_${itemDeps.id}_${i}`, label: `팬 소통 대사 ${i + 1}`, original: w });
      });
    }

    // Call Patterns
    else if (type === 'callPatterns' && itemDeps.callPatterns) {
      itemDeps.callPatterns.forEach(cp => {
        entries.push(
          { id: `${cp.patternId}|characterArrivalText`, label: '인사말 대사', original: cp.characterArrivalText },
          { id: `${cp.patternId}|managerCallText`, label: '인사말 답글', original: cp.managerCallText }
        );
      });
    }

    // Company Stories
    else if (type === 'companyStories' && itemDeps.companyStories) {
      const st = itemDeps.companyStories.find(s => s.id === storyId);
      if (st) {
        entries.push({ id: `${st.id}|name`, label: '스토리 제목', original: st.name });
        if (st.description) entries.push({ id: `${st.id}|description`, label: '스토리 설명', original: st.description });
        (st.advFiles || []).forEach(adv => {
          entries.push({ id: `adv|${adv.filename}`, label: '사무소 ADV 스크립트', original: adv.filename, isFile: true, exists: adv.exists });
        });
      }
    }

    // Non-card messages
    else if (type === 'nonCardMessages' && itemDeps.nonCardMessages) {
      const list = itemDeps.nonCardMessages[subType] || [];
      list.forEach(msg => {
        (msg.details || []).forEach(d => {
          entries.push({ id: `${msg.id}|detail.${d.messageDetailId}.text`, label: `[${msg.name || msg.id}] 문자`, original: d.text });
          if (d.choiceText) entries.push({ id: `${msg.id}|detail.${d.messageDetailId}.choiceText`, label: `[${msg.name || msg.id}] 답장 선택지`, original: d.choiceText });
        });
      });
    }

    // Non-card telephones
    else if (type === 'nonCardTelephones' && itemDeps.nonCardTelephones) {
      const list = itemDeps.nonCardTelephones[subType] || [];
      list.forEach(tel => {
        entries.push({ id: `${tel.id}|name`, label: '통화 헤더', original: tel.name || tel.id });
      });
    }

    // Non-card home talks
    else if (type === 'nonCardHomeTalks' && itemDeps.nonCardHomeTalks) {
      const list = itemDeps.nonCardHomeTalks[subType] || [];
      list.forEach(ht => {
        if (ht.choiceText) entries.push({ id: `${ht.id}|choiceText`, label: '선택 대화지', original: ht.choiceText });
        if (ht.managerText) entries.push({ id: `${ht.id}|managerText`, label: '매니저 답글', original: ht.managerText });
        (ht.characterTalks || []).forEach((ct, i) => {
          entries.push({ id: `${ht.id}|talk.${i}`, label: `홈 대사 ${i + 1}`, original: ct.text });
        });
      });
    }

    // Card Node Sub-types
    else if (type === 'card' && itemDeps.cards && cardIndex !== undefined) {
      const card = itemDeps.cards[cardIndex];
      if (card) {
        if (subType === 'card') {
          entries.push(
            { id: `${card.id}|name`, label: '카드 이름', original: card.name },
            { id: `${card.id}|description`, label: '획득 스크립트 설명', original: card.description },
            { id: `${card.id}|obtainMessage`, label: '최초 획득 시 대사', original: card.obtainMessage }
          );
        } else if (subType === 'costume' && card.costume) {
          entries.push({ id: `${card.costume.id}|name`, label: '소유 의상명', original: card.costume.name });
        } else if (subType === 'skills') {
          (card.skills || []).forEach(sk => {
            entries.push({ id: `${sk.id}|name`, label: '스킬 이름', original: sk.name });
            (sk.levels || []).forEach(lvl => {
              entries.push({ id: `${sk.id}|level.${lvl.level}.description`, label: `Lv.${lvl.level} 설명`, original: lvl.description });
            });
          });
        } else if (subType === 'stories') {
          (card.stories || []).forEach(st => {
            entries.push({ id: `${st.id}|name`, label: '스토리 에피소드 제목', original: st.name });
            if (st.description) entries.push({ id: `${st.id}|description`, label: '스토리 상세 설명', original: st.description });
            (st.advFiles || []).forEach(adv => {
              entries.push({ id: `adv|${adv.filename}`, label: '카드 ADV 스크립트', original: adv.filename, isFile: true, exists: adv.exists });
            });
          });
        } else if (subType === 'messages') {
          (card.messages || []).forEach(msg => {
            (msg.details || []).forEach(d => {
              entries.push({ id: `${msg.id}|detail.${d.messageDetailId}.text`, label: `[문자]`, original: d.text });
              if (d.choiceText) entries.push({ id: `${msg.id}|detail.${d.messageDetailId}.choiceText`, label: `[문자 답장]`, original: d.choiceText });
            });
          });
        } else if (subType === 'telephones') {
          (card.telephones || []).forEach(tel => {
            entries.push({ id: `${tel.id}|name`, label: '카드 통화 헤더', original: tel.name || tel.id });
          });
        } else if (subType === 'homeTalks') {
          (card.homeTalks || []).forEach(ht => {
            if (ht.choiceText) entries.push({ id: `${ht.id}|choiceText`, label: '홈 선택 대사', original: ht.choiceText });
            if (ht.managerText) entries.push({ id: `${ht.id}|managerText`, label: '매니저 답글', original: ht.managerText });
            (ht.characterTalks || []).forEach((ct, i) => {
              entries.push({ id: `${ht.id}|talk.${i}`, label: `홈 대사 ${i + 1}`, original: ct.text });
            });
          });
        } else if (subType === 'evolutionMessages') {
          (card.evolutionMessages || []).forEach(em => {
            entries.push({ id: `${em.cardId}|evo.${em.evolutionLevel}.${em.number}`, label: `개화 ${em.evolutionLevel}단계 - 대사 ${em.number}`, original: em.evolveMessage });
          });
        }
      }
    }

    // Group Chats Messages & Telephones
    else if (type === 'groupChatMessages' && itemDeps.messages) {
      itemDeps.messages.forEach(msg => {
        (msg.details || []).forEach(d => {
          const sender = d.characterId ? `[${d.characterId.replace('char-', '').toUpperCase()}] ` : '';
          if (d.text) {
            entries.push({ id: `${msg.id}|detail.${d.messageDetailId}.text`, label: `${sender}메시지 [${d.messageDetailId}]`, original: d.text });
          }
          if (d.choiceText) {
            entries.push({ id: `${msg.id}|detail.${d.messageDetailId}.choiceText`, label: `답장 선택지 [${d.messageDetailId}]`, original: d.choiceText });
          }
        });
      });
    }
    else if (type === 'groupChatTelephones' && itemDeps.telephones) {
      itemDeps.telephones.forEach(tel => {
        const sender = tel.characterId ? `[${tel.characterId.replace('char-', '').toUpperCase()}] ` : '';
        entries.push({ id: `${tel.id}|name`, label: `${sender}통화 제목`, original: tel.name || tel.id });
      });
    }

    return entries.filter(e => e.original);
  };

  const editorEntries = getEditorEntries();

  // Helper check for active node highlight
  const isNodeActive = (node) => {
    if (!activeSection) return false;
    if (typeof activeSection === 'string' && typeof node === 'string') {
      return activeSection === node;
    }
    if (typeof activeSection === 'object' && typeof node === 'object') {
      return Object.keys(node).every(k => activeSection[k] === node[k]);
    }
    return false;
  };

  // Keyboard shortcut: Ctrl+K for search
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="app-layout">
      {/* ============ Header ============ */}
      <header className="app-header">
        <div className="app-logo">
          <div className="logo-icon">⭐</div>
          <span>HoshimiStation</span>
        </div>

        <div className="app-search">
          <span className="search-icon">🔍</span>
          <input
            ref={searchRef}
            type="text"
            id="global-search-input"
            placeholder="검색... (Ctrl+K)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="header-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: 'var(--space-md)' }}>
            <div className="online-dot" />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>MasterDB Local Live</span>
          </div>
          <button className="btn btn-secondary btn-sm" id="btn-sync">
            ⟳ Sync
          </button>
          <button className="btn btn-primary btn-sm" id="btn-export">
            📥 Export
          </button>
        </div>
      </header>

      {/* ============ Main Panels ============ */}
      <main className="app-main">
        {/* ---- Left Panel: Content Navigator ---- */}
        <aside className="panel panel-left">
          <div className="panel-header" style={{ paddingBottom: 'var(--space-sm)' }}>
            <h2>대분류 카테고리</h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
              {items.length} items
            </span>
          </div>

          {/* Core Categories Navigation */}
          <div style={{ display: 'flex', gap: '4px', padding: 'var(--space-sm) var(--space-md)', borderBottom: '2px solid var(--border-primary)', background: 'var(--bg-secondary)', flexWrap: 'wrap' }}>
            <button 
              id="tab-characters"
              className={`filter-chip ${category === 'characters' ? 'active' : ''}`}
              onClick={() => { setCategory('characters'); setSelectedItem(null); setItemDeps(null); setFilterGroup(''); }}
              style={{ flex: '1 0 30%', textAlign: 'center', padding: '6px 4px' }}
            >아이돌</button>
            <button 
              id="tab-groupchats"
              className={`filter-chip ${category === 'groupchats' ? 'active' : ''}`}
              onClick={() => { setCategory('groupchats'); setSelectedItem(null); setItemDeps(null); }}
              style={{ flex: '1 0 30%', textAlign: 'center', padding: '6px 4px' }}
            >그룹챗</button>
            <button 
              id="tab-cards"
              className={`filter-chip ${category === 'cards' ? 'active' : ''}`}
              onClick={() => { setCategory('cards'); setSelectedItem(null); setItemDeps(null); }}
              style={{ flex: '1 0 30%', textAlign: 'center', padding: '6px 4px' }}
            >소유 카드</button>
            <button 
              id="tab-events"
              className={`filter-chip ${category === 'events' ? 'active' : ''}`}
              onClick={() => { setCategory('events'); setSelectedItem(null); setItemDeps(null); }}
              style={{ flex: '1 0 30%', textAlign: 'center', padding: '6px 4px' }}
            >이벤트</button>
            <button 
              id="tab-stories"
              className={`filter-chip ${category === 'stories' ? 'active' : ''}`}
              onClick={() => { setCategory('stories'); setSelectedItem(null); setItemDeps(null); }}
              style={{ flex: '1 0 30%', textAlign: 'center', padding: '6px 4px' }}
            >스토리</button>
            <button 
              id="tab-extras"
              className={`filter-chip ${category === 'extras' ? 'active' : ''}`}
              onClick={() => { setCategory('extras'); setSelectedItem(null); setItemDeps(null); }}
              style={{ flex: '1 0 30%', textAlign: 'center', padding: '6px 4px' }}
            >기타</button>
            <button 
              id="tab-generic"
              className={`filter-chip ${category === 'generic' ? 'active' : ''}`}
              onClick={() => { setCategory('generic'); setSelectedItem(null); setItemDeps(null); }}
              style={{ flex: '1 0 30%', textAlign: 'center', padding: '6px 4px' }}
            >기타DB</button>
          </div>

          {/* Group Filter for Characters */}
          {category === 'characters' && (
            <div className="filter-chips" style={{ padding: '6px var(--space-md)' }}>
              {['', '月のテンペ스트', 'サニーピース', 'TRINITYAiLE', 'LizNoir', '長瀬麻奈', 'ⅢX'].map(grp => (
                <button
                  key={grp}
                  className={`filter-chip ${filterGroup === grp ? 'active' : ''}`}
                  onClick={() => setFilterGroup(grp)}
                  style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '10px' }}
                >
                  {grp || '전체'}
                </button>
              ))}
            </div>
          )}

          {/* Items Sidebar Scroll Container */}
          <div className="item-list-container">
            {fetchError ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--status-untranslated)' }}>
                에러: {fetchError}
              </div>
            ) : loading ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>불러오는 중...</div>
            ) : items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>결과가 없습니다</div>
            ) : (
              <div className="item-list">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`card-item ${selectedItem?.id === item.id ? 'active' : ''}`}
                    onClick={() => selectItem(item)}
                    style={item.color ? { borderLeft: `4px solid ${item.color}` } : {}}
                  >
                    <div className="card-info">
                      <div className="card-name" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{item.name}</span>
                        {category === 'characters' && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--accent-blue)', fontWeight: 'bold' }}>{item.short}</span>
                        )}
                      </div>
                      <div className="card-meta">{item.meta || item.assetId || item.id}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* ---- Middle Panel: Relational Tree Navigator (Character Centric) ---- */}
        <div className="panel panel-middle" style={{ background: '#111827' }}>
          <div className="panel-header">
            <h2>관계형 데이터 구조</h2>
          </div>

          <div className="panel-content" style={{ padding: 'var(--space-xs)' }}>
            {!selectedItem ? (
              <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                ← 왼쪽에서 대상을 선택하세요
              </div>
            ) : loadingDeps ? (
              <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
                데이터 트리 구성 중...
              </div>
            ) : itemDeps ? (
              category === 'characters' ? (
                /* ================= RICH CHARACTER TREE VIEW ================= */
                <div className="fade-in">
                  <div className="tree-group-header">기본 정보</div>
                  <div 
                    className={`tree-item-nested ${isNodeActive({ type: 'profile' }) ? 'active' : ''}`}
                    onClick={() => setActiveSection({ type: 'profile' })}
                  >
                    👤 {selectedItem.name} 프로필 텍스트
                  </div>
                  <div 
                    className={`tree-item-nested ${isNodeActive({ type: 'callPatterns' }) ? 'active' : ''}`}
                    onClick={() => setActiveSection({ type: 'callPatterns' })}
                  >
                    📞 홈화면 접속 인사말 대사 ({itemDeps.callPatterns?.length || 0})
                  </div>

                  {/* 1. Owned Cards Node */}
                  <div className="tree-group-header">아이돌 소유 카드 ({itemDeps.cards?.length || 0})</div>
                  {(itemDeps.cards || []).map((card, cidx) => {
                    const isCardExp = !!expandedCards[card.id];
                    return (
                      <div key={card.id} style={{ marginBottom: '2px' }}>
                        <div 
                          className="tree-collapsible-header"
                          onClick={() => toggleCardExpand(card.id)}
                        >
                          <span className={`tree-chevron ${isCardExp ? 'expanded' : ''}`}>▶</span>
                          <span style={{ fontSize: '1rem' }}>🃏</span>
                          <span style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{card.name}</span>
                          <span style={{ fontSize: '0.75rem', background: 'var(--bg-input)', padding: '2px 6px', borderRadius: '8px', color: 'var(--text-muted)' }}>★{card.initialRarity}</span>
                        </div>
                        {isCardExp && (
                          <div className="fade-in">
                            <div 
                              className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'card', cardIndex: cidx, subType: 'card' }) ? 'active' : ''}`}
                              onClick={() => setActiveSection({ type: 'card', cardIndex: cidx, subType: 'card' })}
                            >
                              ▫️ 카드 기본 대사
                            </div>
                            {card.costume && (
                              <div 
                                className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'card', cardIndex: cidx, subType: 'costume' }) ? 'active' : ''}`}
                                onClick={() => setActiveSection({ type: 'card', cardIndex: cidx, subType: 'costume' })}
                              >
                                👗 획득 코스튬
                              </div>
                            )}
                            {card.skills?.length > 0 && (
                              <div 
                                className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'card', cardIndex: cidx, subType: 'skills' }) ? 'active' : ''}`}
                                onClick={() => setActiveSection({ type: 'card', cardIndex: cidx, subType: 'skills' })}
                              >
                                ⚡ 카드 스킬 목록 ({card.skills.length})
                              </div>
                            )}
                            {card.stories?.length > 0 && (
                              <div 
                                className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'card', cardIndex: cidx, subType: 'stories' }) ? 'active' : ''}`}
                                onClick={() => setActiveSection({ type: 'card', cardIndex: cidx, subType: 'stories' })}
                              >
                                📖 카드 개별 스토리 ({card.stories.length})
                              </div>
                            )}
                            {card.messages?.length > 0 && (
                              <div 
                                className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'card', cardIndex: cidx, subType: 'messages' }) ? 'active' : ''}`}
                                onClick={() => setActiveSection({ type: 'card', cardIndex: cidx, subType: 'messages' })}
                              >
                                💬 카드 연동 메시지 ({card.messages.length})
                              </div>
                            )}
                            {card.telephones?.length > 0 && (
                              <div 
                                className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'card', cardIndex: cidx, subType: 'telephones' }) ? 'active' : ''}`}
                                onClick={() => setActiveSection({ type: 'card', cardIndex: cidx, subType: 'telephones' })}
                              >
                                📱 카드 연동 통화 ({card.telephones.length})
                              </div>
                            )}
                            {card.homeTalks?.length > 0 && (
                              <div 
                                className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'card', cardIndex: cidx, subType: 'homeTalks' }) ? 'active' : ''}`}
                                onClick={() => setActiveSection({ type: 'card', cardIndex: cidx, subType: 'homeTalks' })}
                              >
                                🏠 카드 연동 홈대사 ({card.homeTalks.length})
                              </div>
                            )}
                            {card.evolutionMessages?.length > 0 && (
                              <div 
                                className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'card', cardIndex: cidx, subType: 'evolutionMessages' }) ? 'active' : ''}`}
                                onClick={() => setActiveSection({ type: 'card', cardIndex: cidx, subType: 'evolutionMessages' })}
                              >
                                🌸 한정 개화 대사 ({card.evolutionMessages.length})
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* 2. Non-Card Messages Node */}
                  <div className="tree-group-header">미연결 문자/메시지</div>
                  <div className="tree-collapsible-header" onClick={() => toggleNonCardExpand('messages')}>
                    <span className={`tree-chevron ${expandedNonCard.messages ? 'expanded' : ''}`}>▶</span>
                    <span>💬</span>
                    <span>독립 문자 메시지</span>
                  </div>
                  {expandedNonCard.messages && (
                    <div className="fade-in">
                      <div 
                        className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'nonCardMessages', subType: 'instant' }) ? 'active' : ''}`}
                        onClick={() => setActiveSection({ type: 'nonCardMessages', subType: 'instant' })}
                      >
                        ▫️ 일상 즉시 메시지 ({itemDeps.nonCardMessages?.instant?.length || 0})
                      </div>
                      <div 
                        className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'nonCardMessages', subType: 'birthday' }) ? 'active' : ''}`}
                        onClick={() => setActiveSection({ type: 'nonCardMessages', subType: 'birthday' })}
                      >
                        🎂 아이돌 생일 메시지 ({itemDeps.nonCardMessages?.birthday?.length || 0})
                      </div>
                      <div 
                        className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'nonCardMessages', subType: 'story' }) ? 'active' : ''}`}
                        onClick={() => setActiveSection({ type: 'nonCardMessages', subType: 'story' })}
                      >
                        📖 메인/그룹 연동 메시지 ({itemDeps.nonCardMessages?.story?.length || 0})
                      </div>
                      <div 
                        className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'nonCardMessages', subType: 'other' }) ? 'active' : ''}`}
                        onClick={() => setActiveSection({ type: 'nonCardMessages', subType: 'other' })}
                      >
                        ✨ 기타 이벤트성 메시지 ({itemDeps.nonCardMessages?.other?.length || 0})
                      </div>
                    </div>
                  )}

                  {/* 3. Non-Card Telephones Node */}
                  <div className="tree-collapsible-header" onClick={() => toggleNonCardExpand('telephones')}>
                    <span className={`tree-chevron ${expandedNonCard.telephones ? 'expanded' : ''}`}>▶</span>
                    <span>📱</span>
                    <span>독립 전화 수신목록</span>
                  </div>
                  {expandedNonCard.telephones && (
                    <div className="fade-in">
                      <div 
                        className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'nonCardTelephones', subType: 'message' }) ? 'active' : ''}`}
                        onClick={() => setActiveSection({ type: 'nonCardTelephones', subType: 'message' })}
                      >
                        ▫️ 문자 답장성 전화 ({itemDeps.nonCardTelephones?.message?.length || 0})
                      </div>
                      <div 
                        className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'nonCardTelephones', subType: 'birthday' }) ? 'active' : ''}`}
                        onClick={() => setActiveSection({ type: 'nonCardTelephones', subType: 'birthday' })}
                      >
                        🎂 특별 생일 통화 ({itemDeps.nonCardTelephones?.birthday?.length || 0})
                      </div>
                      <div 
                        className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'nonCardTelephones', subType: 'other' }) ? 'active' : ''}`}
                        onClick={() => setActiveSection({ type: 'nonCardTelephones', subType: 'other' })}
                      >
                        ✨ 기타 콜라보 통화 ({itemDeps.nonCardTelephones?.other?.length || 0})
                      </div>
                    </div>
                  )}

                  {/* 4. Non-Card Home Talks Node */}
                  <div className="tree-collapsible-header" onClick={() => toggleNonCardExpand('hometalks')}>
                    <span className={`tree-chevron ${expandedNonCard.hometalks ? 'expanded' : ''}`}>▶</span>
                    <span>🏠</span>
                    <span>독립 홈 대사</span>
                  </div>
                  {expandedNonCard.hometalks && (
                    <div className="fade-in">
                      <div 
                        className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'nonCardHomeTalks', subType: 'character' }) ? 'active' : ''}`}
                        onClick={() => setActiveSection({ type: 'nonCardHomeTalks', subType: 'character' })}
                      >
                        ▫️ 캐릭터 공통 홈대사 ({itemDeps.nonCardHomeTalks?.character?.length || 0})
                      </div>
                      <div 
                        className={`tree-item-nested tree-item-double-nested ${isNodeActive({ type: 'nonCardHomeTalks', subType: 'cardUnlinked' }) ? 'active' : ''}`}
                        onClick={() => setActiveSection({ type: 'nonCardHomeTalks', subType: 'cardUnlinked' })}
                      >
                        🃏 미매핑 카드 홈대사 ({itemDeps.nonCardHomeTalks?.cardUnlinked?.length || 0})
                      </div>
                    </div>
                  )}

                  {/* 5. Company Stories Node */}
                  {itemDeps.companyStories?.length > 0 && (
                    <>
                      <div className="tree-group-header">사무소 친밀도 스토리</div>
                      {itemDeps.companyStories.map((story) => (
                        <div 
                          key={story.id}
                          className={`tree-item-nested ${isNodeActive({ type: 'companyStories', storyId: story.id }) ? 'active' : ''}`}
                          onClick={() => setActiveSection({ type: 'companyStories', storyId: story.id })}
                        >
                          🏢 Ep.{story.number} {story.name}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ) : category === 'groupchats' ? (
                /* ================= GROUP CHAT TREE VIEW ================= */
                <div className="fade-in">
                  <div className="tree-group-header">그룹 대화 데이터</div>
                  <div 
                    className={`tree-item-nested ${isNodeActive({ type: 'groupChatMessages' }) ? 'active' : ''}`}
                    onClick={() => setActiveSection({ type: 'groupChatMessages' })}
                  >
                    💬 그룹 문자 내역 ({itemDeps.messages?.length || 0})
                  </div>
                  <div 
                    className={`tree-item-nested ${isNodeActive({ type: 'groupChatTelephones' }) ? 'active' : ''}`}
                    onClick={() => setActiveSection({ type: 'groupChatTelephones' })}
                  >
                    📞 그룹 연동 통화 ({itemDeps.telephones?.length || 0})
                  </div>
                </div>
              ) : (
                /* ================= LEGACY LIST CONFIG FLAT TREE ================= */
                Object.entries(SECTION_CONFIG).map(([key, config]) => {
                  let count = 0;
                  if (category === 'cards') {
                    if (key === 'card') count = 1;
                    else if (key === 'costume') count = itemDeps.costume ? 1 : 0;
                    else if (key === 'skills') count = itemDeps.skills?.length || 0;
                    else if (key === 'stories') count = itemDeps.stories?.length || 0;
                    else if (key === 'messages') count = itemDeps.messages?.reduce((n, m) => n + (m.details?.length || 0), 0) || 0;
                    else if (key === 'homeTalks') count = itemDeps.homeTalks?.length || 0;
                    else if (key === 'callPatterns') count = itemDeps.callPatterns?.length || 0;
                    else if (key === 'evolutionMessages') count = itemDeps.evolutionMessages?.length || 0;
                    else if (key === 'telephones') count = itemDeps.telephones?.length || 0;
                  } else {
                    if (key === 'info') count = itemDeps.dependencies?.info?.length || 0;
                    else if (key === 'adv') count = itemDeps.dependencies?.adv?.length || 0;
                  }

                  if (count === 0) return null;
                  return (
                    <div key={key} className="file-section fade-in">
                      <div
                        className={`file-section-header ${isNodeActive(key) ? 'active' : ''}`}
                        onClick={() => setActiveSection(activeSection === key ? null : key)}
                        style={isNodeActive(key) ? { background: 'var(--bg-active)', color: config.color } : {}}
                      >
                        <span className="file-section-icon">{config.icon}</span>
                        <span>{config.label}</span>
                        <span className="file-section-count">{count}</span>
                      </div>
                    </div>
                  );
                })
              )
            ) : null}
          </div>
        </div>

        {/* ---- Right Panel: Breathtaking Interactive Translation Editor ---- */}
        <div className="panel panel-right">
          {advEditorData ? (
            /* ================= ADV SUB-SCRIPT DIALOG EDITOR ================= */
            <>
              <div className="editor-toolbar">
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => setAdvEditorData(null)}
                >
                  ← 리스트로 돌아가기
                </button>
                <span className="editor-title" style={{ marginLeft: 'var(--space-md)' }}>🎬 ADV 스크립트 에디터</span>
                <span className="editor-subtitle">{advEditorData.filename}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-sm)' }}>
                  <button className="btn btn-success btn-sm" id="btn-save-adv">💾 번역 임포트/저장</button>
                </div>
              </div>

              <div className="editor-entries">
                {advLoading ? (
                  <div style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
                    ADV 번역 스크립트 파싱 중...
                  </div>
                ) : advEditorData.error ? (
                  <div style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--accent-red)' }}>
                    Error: {advEditorData.error}
                  </div>
                ) : !advEditorData.entries || advEditorData.entries.length === 0 ? (
                  <div style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
                    해당 ADV 스크립트에 파싱 가능한 대사 정보가 없습니다.
                  </div>
                ) : (
                  advEditorData.entries.map((entry, idx) => (
                    <div key={idx} className="translation-entry fade-in" style={{ animationDelay: `${Math.min(idx, 15) * 20}ms` }}>
                      <div className="entry-header">
                        <span className="entry-label" style={{ 
                          background: entry.type === 'choice' ? 'var(--accent-pink)' : 
                                      entry.type === 'title' ? 'var(--accent-purple)' :
                                      entry.type === 'narration' ? 'var(--bg-tertiary)' : 'var(--accent-blue)',
                          color: '#fff',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem'
                        }}>
                          {entry.type === 'choice' ? '지문 선택지' : 
                           entry.type === 'title' ? '에피소드 타이틀' :
                           entry.type === 'narration' ? '나레이션' :
                           (entry.name || '스피커 대사')}
                        </span>
                        <span className="entry-id">Line {entry.lineIndex + 1}</span>
                      </div>

                      <div className="entry-row">
                        <div className="entry-row-label original">Original</div>
                        <div className="entry-row-value">{entry.original}</div>
                      </div>

                      <div className="entry-row">
                        <div className="entry-row-label new">Korean</div>
                        <div className="entry-row-value">
                          <textarea
                            defaultValue={entry.translation || ''}
                            placeholder="한국어 번역문을 입력하세요..."
                            rows={Math.max(2, (entry.original?.split('\n')?.length || 1))}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : !activeSection ? (
            /* ================= EMPTY SELECTION STATE ================= */
            <div className="editor-empty">
              <div className="editor-empty-icon">📝</div>
              <div className="editor-empty-text">
                {selectedItem
                  ? '가운데 관계형 트리에서 구체적인 세부 노드를 클릭해 번역 편집을 시작하세요.'
                  : '좌측 사이드바에서 아이돌, 그룹챗 또는 카드를 선택하여 데이터 의존성 맵을 표시하세요.'}
              </div>
            </div>
          ) : (
            /* ================= MASTERDB DYNAMIC DICTIONARY EDITOR ================= */
            <>
              <div className="editor-toolbar">
                <span style={{ fontSize: '1.1rem' }}>
                  {typeof activeSection === 'string' 
                    ? (SECTION_CONFIG[activeSection]?.icon || '📝') 
                    : (SECTION_CONFIG[activeSection.subType || activeSection.type]?.icon || '📝')}
                </span>
                <span className="editor-title" style={{ marginLeft: '6px' }}>
                  {typeof activeSection === 'string' 
                    ? SECTION_CONFIG[activeSection]?.label 
                    : (SECTION_CONFIG[activeSection.subType || activeSection.type]?.label || '대사 정보')}
                </span>
                <span className="editor-subtitle">{selectedItem?.name}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-sm)' }}>
                  <button className="btn btn-secondary btn-sm" id="btn-revert-db">되돌리기</button>
                  <button className="btn btn-success btn-sm" id="btn-save-db">💾 DB 저장</button>
                </div>
              </div>

              {/* Chat Simulation View for Messages to aid translation context */}
              {((typeof activeSection === 'object' && (activeSection.type === 'groupChatMessages' || activeSection.subType === 'messages' || activeSection.type === 'nonCardMessages'))) && (
                <div style={{ padding: 'var(--space-lg) var(--space-xl) 0', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>💬 대화 시뮬레이션 미리보기</div>
                  <div className="chat-bubble-container">
                    {editorEntries.map((entry, idx) => {
                      const isChoice = entry.id.includes('choiceText');
                      const isLeft = !isChoice && (idx % 2 === 0);
                      return (
                        <div key={idx} className={`chat-bubble ${isChoice ? 'right' : (isLeft ? 'left' : 'right')}`} style={isChoice ? { background: '#8b5cf6' } : {}}>
                          <div className="chat-speaker-name">
                            <span>{isChoice ? 'Manager' : (entry.label || 'Member')}</span>
                            <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>{entry.id.split('|')[1]}</span>
                          </div>
                          <div>{entry.original}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Flat Table/Row Translation Inputs */}
              <div className="editor-entries">
                {editorEntries.map((entry, idx) => (
                  <div key={entry.id} className="translation-entry fade-in" style={{ animationDelay: `${idx * 20}ms` }}>
                    <div className="entry-header">
                      <span className="entry-label">{entry.label}</span>
                      <span className="entry-id">{entry.id}</span>
                    </div>

                    {!entry.isFile ? (
                      <>
                        <div className="entry-row">
                          <div className="entry-row-label original">Original</div>
                          <div className="entry-row-value">{entry.original}</div>
                        </div>

                        <div className="entry-row">
                          <div className="entry-row-label new">Korean</div>
                          <div className="entry-row-value">
                            <textarea
                              defaultValue=""
                              placeholder="번역문을 입력하세요..."
                              rows={Math.max(2, (entry.original?.split('\n')?.length || 1))}
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      /* ADV Sub-File Direct Call Trigger */
                      <div className="entry-row" style={{ alignItems: 'center' }}>
                        <div className="entry-row-value" style={{ fontFamily: 'monospace', flex: 1, fontSize: '0.95rem' }}>
                          📄 {entry.original}
                        </div>
                        {entry.exists ? (
                          <button 
                            className="btn btn-primary btn-sm"
                            onClick={async () => {
                              setAdvLoading(true);
                              setAdvEditorData({ filename: entry.original, entries: [] });
                              try {
                                const res = await fetch(`/api/adv/${entry.original}`, { cache: 'no-store' });
                                const data = await res.json();
                                setAdvEditorData(data);
                              } catch (e) {
                                console.error(e);
                                setAdvEditorData({ filename: entry.original, error: e.message });
                              }
                              setAdvLoading(false);
                            }}
                          >
                            ADV 에디터 열기 →
                          </button>
                        ) : (
                          <span className="status-badge untranslated">ADV 파일 없음</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {editorEntries.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 'var(--space-2xl)', color: 'var(--text-muted)' }}>
                    선택한 데이터 영역에 번역이 필요한 원문 텍스트가 존재하지 않습니다.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
