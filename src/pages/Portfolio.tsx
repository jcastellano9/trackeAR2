import React, { useState, useEffect } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'framer-motion';
import { Search, Plus, TrendingUp, TrendingDown, Loader, X, Check, AlertCircle, Calendar, DollarSign, Edit2, Trash, Heart, ArrowDownCircle } from 'lucide-react';

interface Investment {
  id: string;
  ticker: string;
  name: string;
  type: 'Cripto' | 'Acción' | 'CEDEAR';
  quantity: number;
  purchasePrice: number;
  allocation: number;
  purchaseDate: string;
  currency: 'USD' | 'ARS';
  isFavorite?: boolean;
}

interface NewInvestment {
  ticker: string;
  name: string;
  type: 'Cripto' | 'Acción' | 'CEDEAR';
  quantity: number;
  purchasePrice: number;
  purchaseDate: string;
  currency: 'USD' | 'ARS';
}


interface PredefinedAsset {
  ticker: string;
  name: string;
  type: 'Cripto' | 'Acción' | 'CEDEAR';
  logo: string;
  price?: number;
  id?: string;
}

// --- Función reutilizable para conversión de precios ---
const convertPrice = (
  value: number,
  fromCurrency: 'USD' | 'ARS',
  toCurrency: 'USD' | 'ARS',
  cclPrice: number | null
): number => {
  if (!value || !cclPrice) return value;
  if (fromCurrency === 'USD' && toCurrency === 'ARS') return value * cclPrice;
  if (fromCurrency === 'ARS' && toCurrency === 'USD') return value / cclPrice;
  return value;
};

const Portfolio: React.FC = () => {
  const supabase = useSupabase();
  const { user } = useAuth();

  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [assetSearchTerm, setAssetSearchTerm] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<PredefinedAsset | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [cclPrice, setCclPrice] = useState<number | null>(null);
  // Nuevo estado para filtro por tipo de activo
  const [activeTypeFilter, setActiveTypeFilter] = useState<'Todos' | 'CEDEAR' | 'Cripto' | 'Acción'>('Todos');
  // Estado para unificar transacciones repetidas
  const [mergeTransactions, setMergeTransactions] = useState(true);
  // Estado para alternar visualización entre ARS y USD
  const [showInARS, setShowInARS] = useState(true);
  // Estado para orden de la tabla (ascendente/descendente por criterio)
  const [sortBy, setSortBy] = useState<
    'tickerAZ' | 'tickerZA' |
    'gananciaPorcentajeAsc' | 'gananciaPorcentajeDesc' |
    'gananciaValorAsc' | 'gananciaValorDesc' |
    'tenenciaAsc' | 'tenenciaDesc' |
    'fechaAsc' | 'fechaDesc'
  >('fechaDesc');

  // Estado para edición de inversión
  const [editId, setEditId] = useState<string | null>(null);

  // New investment form state
  const [newInvestment, setNewInvestment] = useState<NewInvestment>({
    ticker: '',
    name: '',
    type: 'CEDEAR',
    quantity: 0,
    purchasePrice: 0,
    purchaseDate: new Date().toISOString().split('T')[0],
    currency: 'ARS',
  });

  // Predefined assets state (dynamic)
  const [predefinedAssets, setPredefinedAssets] = useState<PredefinedAsset[]>([]);
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});

  // Fetch CCL price separately
  useEffect(() => {
    const fetchCCL = async () => {
      try {
        const res = await fetch('https://dolarapi.com/v1/dolares');
        const data = await res.json();
        const ccl = data.find((d: any) => d.casa === 'contadoconliqui');
        if (ccl && ccl.venta) {
          setCclPrice(Number(ccl.venta));
        }
      } catch (err) {
        console.error('No se pudo obtener el precio CCL.', err);
      }
    };
    fetchCCL();
  }, []);

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        // Criptos
        const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd');
        const data = await res.json();
        const formattedAssets: PredefinedAsset[] = data.map((coin: any) => ({
          ticker: coin.symbol.toUpperCase(),
          name: coin.name,
          type: 'Cripto',
          logo: coin.image,
          price: coin.current_price,
          id: coin.id, // Agrega el id de CoinGecko
        }));
        // CEDEARs desde la nueva API
        const cedearRes = await fetch('https://api.cedears.ar/cedears');
        const cedearData = await cedearRes.json();
        const cedears: PredefinedAsset[] = cedearData.map((item: any) => ({
          ticker: item.ticker,
          name: item.name,
          type: 'CEDEAR',
          logo: item.icon,
          price: item.ars?.c,
        }));
        // Acciones desde nueva API
        const accionesRes = await fetch('https://api.cedears.ar/acciones');
        const accionesData = await accionesRes.json();
        const acciones: PredefinedAsset[] = accionesData.map((item: any) => ({
          ticker: item.ticker,
          name: item.name,
          type: 'Acción',
          logo: item.icon,
          price: item.ars?.c,
        }));
        setPredefinedAssets([...formattedAssets, ...cedears, ...acciones]);
      } catch (error) {
        console.error('Error fetching assets', error);
      }
    };
    fetchAssets();
  }, []);

  // 1. Efecto que carga inversiones desde Supabase apenas el usuario está disponible
  useEffect(() => {
    if (!user?.id) return;

    const fetchInvestments = async () => {
      try {
        const { data, error } = await supabase
          .from('investments')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const typeMap: Record<string, 'Cripto' | 'Acción' | 'CEDEAR'> = {
          'cripto': 'Cripto',
          'acción': 'Acción',
          'accion': 'Acción',
          'cedear': 'CEDEAR',
        };

        const investments: Investment[] = data.map((inv: any) => {
          const normalizedType = inv.type ? inv.type.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
          return {
            id: inv.id,
            ticker: inv.ticker,
            name: inv.name,
            type: typeMap[normalizedType] || inv.type || 'Cripto',
            quantity: inv.quantity,
            purchasePrice: inv.purchase_price,
            purchaseDate: inv.purchase_date,
            currency: inv.currency,
            isFavorite: inv.is_favorite,
          };
        });

        setInvestments(investments);
        console.log('Inversiones cargadas desde Supabase (type normalizado):', investments);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching investments:", err);
        setLoading(false);
      }
    };

    fetchInvestments();
  }, [user]);

  // Crear un mapa para lookup rápido por tipo+ticker (mayúsculas)
  const assetMap = React.useMemo(() => {
    const map = new Map();
    predefinedAssets.forEach(asset => {
      map.set(asset.type + '-' + asset.ticker.toUpperCase(), asset);
    });
    return map;
  }, [predefinedAssets]);

  // Normaliza el tipo y quita tildes para evitar errores de mapeo
  function normalizeType(type: string) {
    return type.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  // 2. Efecto que enriquece con datos de predefinedAssets si están disponibles usando assetMap
  useEffect(() => {
    if (!predefinedAssets.length) return;

    setInvestments((prev) =>
      prev.map((inv) => {
        const key = normalizeType(inv.type) + '-' + inv.ticker.toUpperCase();
        const asset = assetMap.get(key);
        return {
          ...inv,
          name: asset?.name || inv.name,
          ticker: asset?.ticker || inv.ticker,
        };
      })
    );
  }, [predefinedAssets, assetMap]);
  // Toggle favorite (actualiza frontend y Supabase)
  const toggleFavorite = async (id: string) => {
    setInvestments(prev =>
      prev.map(inv =>
        inv.id === id ? { ...inv, isFavorite: !inv.isFavorite } : inv
      )
    );

    // También actualiza en Supabase
    const updated = investments.find(inv => inv.id === id);
    if (updated) {
      const { error } = await supabase
        .from('investments')
        .update({ is_favorite: !updated.isFavorite })
        .eq('id', id);
      if (error) {
        console.error('Error al actualizar favorito en Supabase:', error.message);
      }
    }
  };

  // Exportar inversiones como CSV
  const exportToCSV = () => {
    const headers = ['Ticker', 'Nombre', 'Tipo', 'Cantidad', 'PPC', 'Moneda', 'Fecha de compra'];
    const rows = filteredInvestments
      .slice()
      .sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime())
      .map(inv => {
        const key = getNormalizedPpcKey(inv);
        const ppc = ppcMap[key] ?? inv.purchasePrice;
        return [
          inv.ticker,
          inv.name,
          inv.type,
          inv.quantity,
          ppc,
          inv.currency,
          inv.purchaseDate
        ];
      });

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'inversiones.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAssetSelect = async (asset: PredefinedAsset) => {
    setFetchingPrice(true);
    setSelectedAsset(asset); // Asegura que el asset seleccionado esté disponible para el renderizado del modal
    try {
      let price = 0;
      if (asset.type === 'Cripto' && asset.id) {
        // Usar el id de CoinGecko, no el ticker
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${asset.id}&vs_currencies=usd`);
        const data = await res.json();
        price = data[asset.id]?.usd || 0;
        // No multiplicar por CCL para Cripto
      } else if (asset.type === 'Acción') {
        const accionesRes = await fetch('https://api.cedears.ar/acciones');
        const accionesData = await accionesRes.json();
        const found = accionesData.find((a: any) => a.ticker === asset.ticker);
        if (found && found.ars?.c) {
          price = found.ars.c;
        } else {
          throw new Error('No se encontró precio para esta acción');
        }
      } else if (asset.type === 'CEDEAR') {
        const cedearsRes = await fetch('https://api.cedears.ar/cedears');
        const cedearsData = await cedearsRes.json();
        const found = cedearsData.find((c: any) => c.ticker === asset.ticker);
        if (found && found.ars?.c) {
          price = found.ars.c;
        } else {
          throw new Error('No se encontró precio para este CEDEAR');
        }
      }

      setCurrentPrice(price);
      // --- Ajustar purchasePrice según currency ---
      const currency = asset.type === 'Cripto' ? 'USD' : 'ARS';
      const adjustedPrice =
        asset.type === 'Cripto'
          ? price
          : currency === 'USD' && cclPrice
          ? price / cclPrice
          : price;
      // Set all relevant fields at una sola vez, incluyendo purchasePrice
      setNewInvestment(prev => ({
        ...prev,
        ticker: asset.ticker,
        name: asset.name,
        type: asset.type,
        currency: currency,
        purchasePrice: adjustedPrice,
      }));
    } catch (error) {
      console.error('Error fetching price:', error);
    } finally {
      setFetchingPrice(false);
    }
  };

  // Recalcular purchasePrice cuando cambia la moneda (lógica corregida para Cripto)
  useEffect(() => {
    if (!currentPrice || !selectedAsset) return;
    let adjustedPrice = 0;
    if (selectedAsset.type === 'Cripto') {
      if (newInvestment.currency === 'ARS' && cclPrice) {
        adjustedPrice = parseFloat((currentPrice * cclPrice).toFixed(2));
      } else {
        adjustedPrice = parseFloat(currentPrice.toFixed(2));
      }
    } else if (selectedAsset.type === 'Acción' || selectedAsset.type === 'CEDEAR') {
      if (newInvestment.currency === 'ARS') {
        adjustedPrice = parseFloat(currentPrice.toFixed(2));
      } else if (newInvestment.currency === 'USD' && cclPrice) {
        adjustedPrice = parseFloat((currentPrice / cclPrice).toFixed(2));
      }
    }
    setNewInvestment(prev => ({ ...prev, purchasePrice: adjustedPrice }));
    // eslint-disable-next-line
  }, [newInvestment.currency, currentPrice, selectedAsset, cclPrice]);

  const handleAddInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Normalizar los valores de entrada para evitar comas como separador decimal o de miles
    newInvestment.quantity = Number(newInvestment.quantity.toString().replace(/,/g, ''));
    newInvestment.purchasePrice = Number(newInvestment.purchasePrice.toString().replace(/,/g, ''));

    // Validate form
    if (!newInvestment.ticker || !newInvestment.name || !newInvestment.quantity || !newInvestment.purchasePrice || !newInvestment.purchaseDate) {
      setError('Por favor complete todos los campos');
      return;
    }

    if (newInvestment.quantity <= 0) {
      setError('La cantidad debe ser mayor a 0');
      return;
    }

    if (newInvestment.purchasePrice <= 0) {
      console.warn("Precio de compra inválido:", newInvestment.purchasePrice);
      setError('El precio de compra debe ser mayor a 0');
      return;
    }

    if (!user || !user.id) {
      console.warn('Usuario no autenticado o user.id es null');
      return;
    }

    // Debug: log intent to add investment
    console.log("Intentando agregar inversión:", {
      userId: user?.id,
      ...newInvestment
    });

    // Convertir fecha al formato ISO (YYYY-MM-DD)
    const formattedDate = new Date(newInvestment.purchaseDate).toISOString().split('T')[0];

    try {
      if (editId) {
        const confirmEdit = window.confirm('✏️ ¿Estás seguro que deseas guardar los cambios?');
        if (!confirmEdit) return;
        // UPDATE si hay editId
        const { error } = await supabase.from('investments')
          .update({
            ticker: newInvestment.ticker,
            name: newInvestment.name,
            type: newInvestment.type,
            quantity: newInvestment.quantity,
            purchase_price: newInvestment.purchasePrice,
            purchase_date: formattedDate,
            currency: newInvestment.currency,
          })
          .eq('id', editId)
          .eq('user_id', user.id);
        if (error) {
          setError(error.message);
          return;
        }
        setSuccess('Inversión actualizada');
      } else {
        // INSERT normal
        const { data, error } = await supabase.from('investments').insert([
          {
            user_id: user.id,
            ticker: newInvestment.ticker,
            name: newInvestment.name,
            type: newInvestment.type,
            quantity: newInvestment.quantity,
            purchase_price: newInvestment.purchasePrice,
            purchase_date: formattedDate,
            currency: newInvestment.currency,
            is_favorite: false
          }
        ]);
        console.log("Respuesta de Supabase:", { data, error });
        if (error) {
          console.error("Supabase insert error:", error);
          setError(error.message);
          return;
        }
        setSuccess('Inversión agregada');
      }

      // Reset form
      setNewInvestment({
        ticker: '',
        name: '',
        type: 'CEDEAR',
        quantity: 0,
        purchasePrice: 0,
        purchaseDate: new Date().toISOString().split('T')[0],
        currency: 'ARS',
      });
      setCurrentPrice(null);
      setEditId(null);

      // Refetch investments from Supabase
      const fetchInvestments = async () => {
        if (!user || !user.id) {
          console.warn('Usuario no autenticado o user.id es null');
          return;
        }
        try {
          const { data, error } = await supabase
              .from('investments')
              .select('*')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false });
          if (error) throw error;
          const typeMap: Record<string, 'Cripto' | 'Acción' | 'CEDEAR'> = {
            'cripto': 'Cripto',
            'acción': 'Acción',
            'accion': 'Acción',
            'cedear': 'CEDEAR',
          };
          const investments: Investment[] = data.map((inv: any) => {
            const normalizedType = inv.type ? inv.type.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
            return {
              id: inv.id,
              ticker: inv.ticker,
              name: inv.name,
              type: typeMap[normalizedType] || inv.type || 'Cripto',
              quantity: inv.quantity,
              purchasePrice: inv.purchase_price,
              purchaseDate: inv.purchase_date,
              currency: inv.currency,
              isFavorite: inv.is_favorite,
            };
          });
          setInvestments(investments);
          console.log('Inversiones cargadas desde Supabase (type normalizado):', investments);
        } catch (error) {
          console.error('Error fetching investments after add:', error);
        }
      };
      await fetchInvestments();

      // Close modal after a short delay
      setTimeout(() => {
        setShowAddModal(false);
        setSuccess(null);
      }, 1500);

    } catch (error) {
      console.error('Error al agregar la inversión:', error);
      setError('Error al agregar la inversión');
    }
  };

  const filteredAssets = predefinedAssets.filter(
      (asset) =>
          asset.type === newInvestment.type &&
          (asset.ticker.toLowerCase().includes(assetSearchTerm.toLowerCase()) ||
              asset.name.toLowerCase().includes(assetSearchTerm.toLowerCase()))
  );
  // Edit investment
  const handleEditInvestment = (investment: Investment) => {
    setEditId(investment.id);
    setNewInvestment({
      ticker: investment.ticker,
      name: investment.name,
      type: investment.type,
      quantity: investment.quantity,
      purchasePrice: investment.purchasePrice,
      purchaseDate: investment.purchaseDate,
      currency: investment.currency,
    });
    setShowAddModal(true);
  };

  // Delete investment
  const handleDeleteInvestment = async (id: string) => {
    const confirmDelete = window.confirm('🗑️ ¿Seguro que deseas eliminar esta inversión? Esta acción no se puede deshacer.');
    if (!confirmDelete) return;

    try {
      const { error } = await supabase.from('investments').delete().eq('id', id);
      if (error) {
        alert('Error al eliminar la inversión: ' + error.message);
        return;
      }
      setInvestments((prev) => prev.filter((inv) => inv.id !== id));
    } catch (err) {
      alert('Error al eliminar la inversión');
      console.error(err);
    }
  };


  // Lógica corregida: conversión diferenciada para Cripto, Acción, CEDEAR y contexto ARS/USD
  const calculateReturn = (
    current: number,
    purchase: number,
    currency: 'USD' | 'ARS',
    showInARS: boolean,
    cclPrice: number | null,
    type?: 'Cripto' | 'Acción' | 'CEDEAR'
  ) => {
    if (!purchase || isNaN(current) || isNaN(purchase)) {
      return { amount: 0, percentage: 0 };
    }

    let adjustedCurrent = current;
    let adjustedPurchase = purchase;

    // Para Cripto: si la vista es ARS, multiplicar ambos por CCL
    if (type === 'Cripto') {
      if (showInARS && cclPrice) {
        adjustedCurrent = current * cclPrice;
        adjustedPurchase = purchase * cclPrice;
      }
    }
    // Para Acción o CEDEAR: lógica diferenciada para ARS/USD (corregida para evitar conversión errónea)
    else if ((type === 'Acción' || type === 'CEDEAR')) {
      if (currency === 'USD' && showInARS && cclPrice) {
        adjustedCurrent = current * cclPrice;
        adjustedPurchase = purchase * cclPrice;
      } else if (currency === 'ARS' && !showInARS && cclPrice) {
        adjustedCurrent = current / cclPrice;
        adjustedPurchase = purchase / cclPrice;
      }
    }

    const difference = adjustedCurrent - adjustedPurchase;
    const percentage = (difference / adjustedPurchase) * 100;
    return {
      amount: difference,
      percentage: percentage
    };
  };

  // Nueva función para obtener el precio ajustado según la visualización
  const getAdjustedPrice = (inv: Investment): number => {
    const key = getAssetKey(inv);
    let price = marketPrices[key] ?? inv.purchasePrice;

    if (inv.type === 'Cripto') {
      if (showInARS && cclPrice) {
        price *= cclPrice;
      }
    } else if (inv.type === 'CEDEAR' || inv.type === 'Acción') {
      if (inv.currency === 'USD' && showInARS && cclPrice) {
        // ya viene en ARS
      } else if (inv.currency === 'ARS' && !showInARS && cclPrice) {
        price = price / cclPrice;
      } else if (inv.currency === 'USD' && !showInARS && cclPrice) {
        price = price / cclPrice;
      }
    }

    return price;
  };

  // Ordenar inversiones según sortBy (nueva lógica completa)
  const filteredInvestments = investments
    .filter(investment =>
      investment.ticker &&
      !isNaN(investment.purchasePrice) &&
      !isNaN(investment.quantity) &&
      (activeTypeFilter === 'Todos' || investment.type === activeTypeFilter) &&
      (investment.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
        investment.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

  filteredInvestments.sort((a, b) => {
    // Favoritos primero
    if ((b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0) !== 0)
      return (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
    // Nueva lógica de orden:
    if (sortBy === 'tickerAZ') return a.ticker.localeCompare(b.ticker);
    if (sortBy === 'tickerZA') return b.ticker.localeCompare(a.ticker);

    if (sortBy === 'gananciaPorcentajeAsc') {
      const retA = getAdjustedPrice(a) && a.purchasePrice ? calculateReturn(getAdjustedPrice(a), a.purchasePrice, a.currency, showInARS, cclPrice, a.type).percentage : 0;
      const retB = getAdjustedPrice(b) && b.purchasePrice ? calculateReturn(getAdjustedPrice(b), b.purchasePrice, b.currency, showInARS, cclPrice, b.type).percentage : 0;
      return retA - retB;
    }
    if (sortBy === 'gananciaPorcentajeDesc') {
      const retA = getAdjustedPrice(a) && a.purchasePrice ? calculateReturn(getAdjustedPrice(a), a.purchasePrice, a.currency, showInARS, cclPrice, a.type).percentage : 0;
      const retB = getAdjustedPrice(b) && b.purchasePrice ? calculateReturn(getAdjustedPrice(b), b.purchasePrice, b.currency, showInARS, cclPrice, b.type).percentage : 0;
      return retB - retA;
    }

    if (sortBy === 'gananciaValorAsc') {
      const priceA = getAdjustedPrice(a);
      const priceB = getAdjustedPrice(b);
      const retA = priceA && a.purchasePrice
        ? calculateReturn(priceA, a.purchasePrice, a.currency, showInARS, cclPrice, a.type).amount
        : 0;
      const retB = priceB && b.purchasePrice
        ? calculateReturn(priceB, b.purchasePrice, b.currency, showInARS, cclPrice, b.type).amount
        : 0;
      return retA - retB;
    }
    if (sortBy === 'gananciaValorDesc') {
      const priceA = getAdjustedPrice(a);
      const priceB = getAdjustedPrice(b);
      const retA = priceA && a.purchasePrice
        ? calculateReturn(priceA, a.purchasePrice, a.currency, showInARS, cclPrice, a.type).amount
        : 0;
      const retB = priceB && b.purchasePrice
        ? calculateReturn(priceB, b.purchasePrice, b.currency, showInARS, cclPrice, b.type).amount
        : 0;
      return retB - retA;
    }

    if (sortBy === 'tenenciaAsc') {
      const tenA = getAdjustedPrice(a) * a.quantity;
      const tenB = getAdjustedPrice(b) * b.quantity;
      return tenA - tenB;
    }
    if (sortBy === 'tenenciaDesc') {
      const tenA = getAdjustedPrice(a) * a.quantity;
      const tenB = getAdjustedPrice(b) * b.quantity;
      return tenB - tenA;
    }

    if (sortBy === 'fechaAsc') {
      const dateA = new Date(a.purchaseDate).getTime();
      const dateB = new Date(b.purchaseDate).getTime();
      return dateA - dateB;
    }
    if (sortBy === 'fechaDesc') {
      const dateA = new Date(a.purchaseDate).getTime();
      const dateB = new Date(b.purchaseDate).getTime();
      return dateB - dateA;
    }
    return 0;
  });

  // Agrupamiento de inversiones si mergeTransactions está activo
  const displayedInvestments = mergeTransactions
    ? Object.values(
        filteredInvestments.reduce((acc, inv) => {
          const key = `${inv.ticker}-${inv.type}`;
          if (!acc[key]) {
            acc[key] = { ...inv };
          } else {
            const prevQty = acc[key].quantity;
            const newQty = prevQty + inv.quantity;
            // PPC ponderado
            acc[key].purchasePrice =
              (acc[key].purchasePrice * prevQty + inv.purchasePrice * inv.quantity) / newQty;
            acc[key].quantity = newQty;
            acc[key].allocation = (acc[key].allocation ?? 0) + (inv.allocation ?? 0);
          }
          return acc;
        }, {} as Record<string, Investment>)
      )
    : filteredInvestments;


  const formatCurrency = (value: number, currency: 'USD' | 'ARS' = 'ARS') => {
    const formatter = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: currency === 'USD' ? 2 : 0,
      maximumFractionDigits: currency === 'USD' ? 2 : 0,
      notation: 'standard',
      useGrouping: true
    });
    return formatter.format(value);
  };

  // Calcular totales en ARS y USD y visualización dinámica
  const totalARS = displayedInvestments.reduce((acc, inv) => {
    return acc + convertPrice(inv.currentPrice * inv.quantity, inv.currency, 'ARS', cclPrice);
  }, 0);

  const totalUSD = displayedInvestments
      .filter((inv) => inv.currency === 'USD')
      .reduce((acc, inv) => acc + inv.currentPrice * inv.quantity, 0);

  // Totales para visualización según showInARS (corregido para convertir correctamente y evitar NaN)
  const totalToShow = displayedInvestments.reduce((acc, inv) => {
    const value = inv.currentPrice * inv.quantity;
    return acc + convertPrice(value, inv.currency, showInARS ? 'ARS' : 'USD', cclPrice);
  }, 0);
  const totalCurrencyToShow = showInARS ? 'ARS' : 'USD';

  useEffect(() => {
    window.onerror = function (message, source, lineno, colno, error) {
      console.error("Global Error:", { message, source, lineno, colno, error });
    };
  }, []);

  useEffect(() => {
    const fetchMarketPrices = async () => {
      const prices: Record<string, number> = {};

      // Criptos
      const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd');
      const data = await res.json();
      data.forEach((coin: any) => {
        prices['Cripto-' + coin.symbol.toUpperCase()] = coin.current_price;
      });

      // CEDEARs
      const cedearRes = await fetch('https://api.cedears.ar/cedears');
      const cedearData = await cedearRes.json();
      cedearData.forEach((item: any) => {
        prices['CEDEAR-' + item.ticker.toUpperCase()] = item.ars?.c ?? 0;
      });

      // Acciones
      const accionesRes = await fetch('https://api.cedears.ar/acciones');
      const accionesData = await accionesRes.json();
      accionesData.forEach((item: any) => {
        prices['Acción-' + item.ticker.toUpperCase()] = item.ars?.c ?? 0;
      });

      setMarketPrices(prices);
    };
    fetchMarketPrices();
  }, []);

  console.log("Portfolio renderizado");
  if (!user) return <div>Usuario no autenticado</div>;

  // Calcular PPC promedio ponderado por activo (ticker+tipo, usando ticker en mayúsculas)
  const ppcMap: Record<string, number> = React.useMemo(() => {
    const map: Record<string, { totalQty: number; totalCost: number }> = {};
    investments.forEach(inv => {
      // Normalizar type explícitamente para coincidir con los keys usados en el render
      const normalizedType = typeof inv.type === 'string'
        ? inv.type.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        : inv.type;
      const key = inv.ticker.toUpperCase() + '-' + normalizedType;
      if (!map[key]) {
        map[key] = { totalQty: 0, totalCost: 0 };
      }
      map[key].totalQty += inv.quantity;
      map[key].totalCost += inv.purchasePrice * inv.quantity;
    });
    const result: Record<string, number> = {};
    Object.keys(map).forEach(key => {
      result[key] = map[key].totalQty > 0 ? map[key].totalCost / map[key].totalQty : 0;
    });
    return result;
  }, [investments]);

  // Calcular total de tenencias para asignación usando la misma lógica y conversiones de priceUnit * quantity que se usa en cada fila
  const totalTenencia = displayedInvestments.reduce(
    (acc, inv) => {
      // Usar la misma lógica que en cada fila para el cálculo de priceUnit
      const key = getAssetKey(inv);
      const ppcKey = getNormalizedPpcKey(inv);
      const currentPrice = marketPrices[key] ?? inv.purchasePrice;

      const isMerged = mergeTransactions;
      const priceOfPurchase = isMerged
        ? ppcMap[ppcKey] ?? inv.purchasePrice
        : inv.purchasePrice;

      let priceUnit = currentPrice;
      let ppcUnit = priceOfPurchase;

      if (inv.type === 'Cripto') {
        if (showInARS && cclPrice) {
          priceUnit = currentPrice * cclPrice;
          ppcUnit = ppcUnit * cclPrice;
        }
      } else if (inv.type === 'CEDEAR' || inv.type === 'Acción') {
        if (inv.currency === 'USD' && showInARS && cclPrice) {
          priceUnit = currentPrice;
          ppcUnit = ppcUnit * cclPrice;
        } else if (inv.currency === 'ARS' && !showInARS && cclPrice) {
          priceUnit = currentPrice / cclPrice;
          ppcUnit = ppcUnit / cclPrice;
        } else if (inv.currency === 'USD' && !showInARS && cclPrice) {
          priceUnit = currentPrice / cclPrice;
          // ppcUnit ya está en USD
        }
      }

      return acc + priceUnit * inv.quantity;
    },
    0
  );

  // --- RESUMEN GLOBAL PARA TARJETAS "Actual" y "Resultado" ---
  const resumenGlobal = displayedInvestments.reduce(
    (acc, inv) => {
      const key = getAssetKey(inv);
      const ppcKey = getNormalizedPpcKey(inv);
      const currentPrice = marketPrices[key] ?? inv.purchasePrice;
      // Nueva lógica coherente con la vista de tabla
      let priceUnit = currentPrice;
      let ppcUnit = ppcMap[ppcKey] ?? inv.purchasePrice;
      if (inv.type === 'Cripto') {
        if (showInARS && cclPrice) {
          priceUnit *= cclPrice;
          ppcUnit *= cclPrice;
        }
      } else if (inv.type === 'Acción' || inv.type === 'CEDEAR') {
        if (inv.currency === 'USD' && showInARS && cclPrice) {
          ppcUnit *= cclPrice;
          // priceUnit ya está en ARS
        } else if (inv.currency === 'ARS' && !showInARS && cclPrice) {
          priceUnit /= cclPrice;
          ppcUnit /= cclPrice;
        } else if (inv.currency === 'USD' && !showInARS && cclPrice) {
          // currentPrice viene en ARS, necesito convertirlo a USD
          priceUnit /= cclPrice;
          // ppcUnit ya está en USD
        }
      }
      const differencePerUnit = priceUnit - ppcUnit;
      const valorActual = priceUnit * inv.quantity;
      const cambioAbsoluto = differencePerUnit * inv.quantity;
      // Usar ppcUnit * inv.quantity para el invertido, así todo queda en la moneda visualizada
      return {
        valorActual: acc.valorActual + valorActual,
        cambioTotal: acc.cambioTotal + cambioAbsoluto,
        invertido: acc.invertido + ppcUnit * inv.quantity
      };
    },
    { valorActual: 0, cambioTotal: 0, invertido: 0 }
  );

  const resultadoPorcentaje = resumenGlobal.invertido > 0
    ? (resumenGlobal.cambioTotal / resumenGlobal.invertido) * 100
    : 0;

  return (
      <div className="space-y-6">
        {/* Export CSV, Add Investment, and View in USD buttons grouped */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-wrap justify-between items-center gap-4"
        >
          <div className="text-center sm:text-left">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Mi Cartera</h1>
            <p className="text-gray-600 dark:text-gray-400">Gestiona tus inversiones</p>
          </div>
          <div className="flex gap-3 flex-wrap justify-end items-center">
            <button
              onClick={exportToCSV}
              className="px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors bg-pink-600 text-white hover:bg-pink-700"
              title="Descargar CSV"
            >
              <ArrowDownCircle size={16} className="text-white" />
              Exportar
            </button>
            <button
              onClick={() => setShowInARS(prev => !prev)}
              className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                showInARS
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-[#0EA5E9] text-white hover:bg-[#0284c7]'
              }`}
            >
              <DollarSign size={16} className="text-white" />
              Ver en {showInARS ? 'USD' : 'ARS'}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 rounded-lg border text-sm flex items-center gap-2 transition-colors bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
            >
              Agregar
              <Plus size={18} />
            </button>
          </div>
        </motion.div>

        {/* Resumen de totales (nuevo diseño y orden, todo centrado y uniforme) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4 text-center text-sm font-medium">
          {/* Total de inversiones */}
          <div className={`p-4 rounded-xl ${
            activeTypeFilter === 'Todos'
              ? 'bg-gradient-to-br from-blue-100 to-blue-50 text-blue-700'
              : activeTypeFilter === 'Cripto'
              ? 'bg-gradient-to-br from-orange-100 to-orange-50 text-orange-700'
              : activeTypeFilter === 'CEDEAR'
              ? 'bg-gradient-to-br from-purple-100 to-purple-50 text-purple-700'
              : 'bg-[#E0F2FE] text-[#0EA5E9]'
          } shadow-sm border flex flex-col justify-center items-center`}>
            <h3 className="">Total de inversiones</h3>
            <p className="text-xl font-bold mt-1 text-center leading-tight">
              {mergeTransactions
                ? displayedInvestments.length
                : filteredInvestments.length}
            </p>
          </div>

          {/* Invertido */}
          <div className={`p-4 rounded-xl ${
            activeTypeFilter === 'Todos'
              ? 'bg-gradient-to-br from-blue-100 to-blue-50 text-blue-700'
              : activeTypeFilter === 'Cripto'
              ? 'bg-gradient-to-br from-orange-100 to-orange-50 text-orange-700'
              : activeTypeFilter === 'CEDEAR'
              ? 'bg-gradient-to-br from-purple-100 to-purple-50 text-purple-700'
              : 'bg-[#E0F2FE] text-[#0EA5E9]'
          } shadow-sm border flex flex-col justify-center items-center`}>
            <h3>Invertido</h3>
            <p className="text-xl font-bold mt-1">
              {formatCurrency(
                displayedInvestments.reduce((acc, i) => {
                  const val = i.purchasePrice * i.quantity;
                  return acc + convertPrice(val, i.currency, totalCurrencyToShow, cclPrice);
                }, 0),
                totalCurrencyToShow
              )}
            </p>
          </div>

          {/* Valor Total del Portafolio (nuevo: global, color según ganancia/pérdida global) */}
          <div className={`p-4 rounded-xl shadow-sm border flex flex-col justify-center items-center col-span-full md:col-span-2 md:col-start-3 ${
            (() => {
              const totalActual = investments.reduce((acc, i) => {
                const key = i.ticker + '-' + i.type;
                const currentPrice = marketPrices[key] ?? i.purchasePrice;
                const val = currentPrice * i.quantity;
                if (showInARS) {
                  if (i.currency === 'USD' && cclPrice) return acc + val * cclPrice;
                  if (i.currency === 'ARS') return acc + val;
                } else {
                  if (i.currency === 'ARS' && cclPrice) return acc + val / cclPrice;
                  if (i.currency === 'USD') return acc + val;
                }
                return acc;
              }, 0);
              const totalInvertido = investments.reduce((acc, i) => {
                const val = i.purchasePrice * i.quantity;
                if (showInARS) {
                  if (i.currency === 'USD' && cclPrice) return acc + val * cclPrice;
                  if (i.currency === 'ARS') return acc + val;
                } else {
                  if (i.currency === 'ARS' && cclPrice) return acc + val / cclPrice;
                  if (i.currency === 'USD') return acc + val;
                }
                return acc;
              }, 0);
              if (totalActual > totalInvertido) return 'bg-green-50 text-green-700';
              if (totalActual < totalInvertido) return 'bg-red-50 text-red-700';
              return 'bg-blue-50 text-blue-700';
            })()
          }`}>
            <h3>Valor Total del Portafolio</h3>
            <p className="text-xl font-bold mt-1 text-current">
              {formatCurrency(
                investments.reduce((acc, i) => {
                  const key = i.ticker + '-' + i.type;
                  const currentPrice = marketPrices[key] ?? i.purchasePrice;
                  const val = currentPrice * i.quantity;
                  return acc + convertPrice(val, i.currency, showInARS ? 'ARS' : 'USD', cclPrice);
                }, 0),
                showInARS ? 'ARS' : 'USD'
              )}
            </p>
          </div>

          {/* Actual */}
          <div className={`p-4 rounded-xl shadow-sm border flex flex-col justify-center items-center ${
            (() => {
              const actual = resumenGlobal.valorActual;
              const invertido = resumenGlobal.invertido;
              if (actual > invertido) return 'bg-green-50 text-green-700';
              if (actual < invertido) return 'bg-red-50 text-red-700';
              return 'bg-blue-50 text-blue-700';
            })()
          }`}>
            <h3>Actual</h3>
            <p className="text-xl font-bold mt-1">
              {formatCurrency(resumenGlobal.valorActual, totalCurrencyToShow)}
            </p>
          </div>

          {/* Resultado */}
          <div className={`p-4 rounded-xl shadow-sm border flex flex-col justify-center items-center ${
            (() => {
              const actual = resumenGlobal.valorActual;
              const invertido = resumenGlobal.invertido;
              if (actual > invertido) return 'bg-green-50 text-green-700';
              if (actual < invertido) return 'bg-red-50 text-red-700';
              return 'bg-blue-50 text-blue-700';
            })()
          }`}>
            <h3>Resultado</h3>
            <p className="text-xl font-bold mt-1">
              {formatCurrency(resumenGlobal.cambioTotal, totalCurrencyToShow)} ({resultadoPorcentaje.toFixed(2)}%)
            </p>
          </div>

        </div>

        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="bg-white backdrop-blur-sm bg-opacity-80 rounded-xl shadow-sm p-6 border border-gray-100"
        >
          {/* Filtros, Desglosar, Buscador y Orden: nuevo orden y estilos */}
          <div className="flex flex-wrap gap-4 justify-between items-center mb-6">
            {/* Filtros de tipo */}
            <div className="flex flex-wrap gap-2 items-center">
              {[
                { label: 'Todos', value: 'Todos' },
                { label: 'Acciones', value: 'Acción' },
                { label: 'CEDEARs', value: 'CEDEAR' },
                { label: 'Criptomonedas', value: 'Cripto' },
              ].map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setActiveTypeFilter(value as any)}
                  className={`px-3 py-1.5 h-9 rounded-lg text-sm border flex items-center justify-center ${
                    activeTypeFilter === value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Switch mergeTransactions: arriba a la derecha, alineado con filtros y buscador */}
            <div className="flex items-center">
              <button
                type="button"
                aria-pressed={mergeTransactions}
                onClick={() => setMergeTransactions((prev) => !prev)}
                className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors focus:outline-none ${
                  mergeTransactions ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
                tabIndex={0}
              >
                <span
                  className={`inline-block w-5 h-5 transform bg-white dark:bg-gray-200 rounded-full shadow transition-transform duration-200 
                    ${mergeTransactions ? 'translate-x-5' : 'translate-x-1'}`}
                />
              </button>
            </div>
            {/* Buscador y Orden */}
            <div className="flex-1 flex gap-4 justify-end flex-wrap items-center">
              <div className="relative flex-1 w-full max-w-xs">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por Ticker o Nombre..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-xs w-full h-9 pl-10 pr-4 text-sm py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <select
                  id="sortBy"
                  value={sortBy}
                  onChange={e =>
                    setSortBy(e.target.value as
                      'tickerAZ' | 'tickerZA' |
                      'gananciaPorcentajeAsc' | 'gananciaPorcentajeDesc' |
                      'gananciaValorAsc' | 'gananciaValorDesc' |
                      'tenenciaAsc' | 'tenenciaDesc' |
                      'fechaAsc' | 'fechaDesc'
                    )
                  }
                  className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="tickerAZ">Ticker A-Z</option>
                  <option value="tickerZA">Ticker Z-A</option>
                  <option value="gananciaPorcentajeAsc">Ganancia % ↑</option>
                  <option value="gananciaPorcentajeDesc">Ganancia % ↓</option>
                  <option value="gananciaValorAsc">Ganancia $ ↑</option>
                  <option value="gananciaValorDesc">Ganancia $ ↓</option>
                  <option value="tenenciaAsc">Tenencia ↑</option>
                  <option value="tenenciaDesc">Tenencia ↓</option>
                  <option value="fechaAsc">Fecha ↑</option>
                  <option value="fechaDesc">Fecha ↓</option>
                </select>
              </div>
            </div>
          </div>



          {loading ? (
              <div className="flex justify-center items-center h-40">
                <Loader className="animate-spin text-blue-600" size={24} />
              </div>
          ) : displayedInvestments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                  <tr className="text-left border-b border-gray-200">
                    {!mergeTransactions && (
                      <th className="pb-3 px-4 text-sm font-semibold text-gray-600 text-center">❤️</th>
                    )}
                    <th className="pb-3 px-4 text-sm font-semibold text-gray-600">Ticker</th>
                    <th className="pb-3 px-4 text-sm font-semibold text-gray-600 text-center">Nombre</th>
                    <th className="pb-3 px-4 text-sm font-semibold text-gray-600 text-center">Precio Acual</th>
                    <th className="pb-3 px-4 text-sm font-semibold text-gray-600 text-center">Cambio $</th>
                    <th className="pb-3 px-4 text-sm font-semibold text-gray-600 text-center">Cambio %</th>
                    <th className="pb-3 px-4 text-sm font-semibold text-gray-600 text-center">Cantidad</th>
                    <th className="pb-3 px-4 text-sm font-semibold text-gray-600 text-center">PPC</th>
                    <th className="pb-3 px-4 text-sm font-semibold text-gray-600 text-center">Tenencia</th>
                    {!mergeTransactions && (
                      <th className="pb-3 px-4 text-sm font-semibold text-gray-600 text-center">Fecha</th>
                    )}
                    <th className="pb-3 px-4 text-sm font-semibold text-gray-600 text-center">Asignación</th>
                    {!mergeTransactions && (
                      <th className="pb-3 px-4 text-sm font-semibold text-gray-600 text-center">Acciones</th>
                    )}
                  </tr>
                  </thead>
                  <tbody>
                  {displayedInvestments.map((investment) => {
                    const key = getAssetKey(investment);
                    const ppcKey = getNormalizedPpcKey(investment);
                    // Usar siempre el precio de mercado más reciente si está disponible, luego purchasePrice
                    let currentPrice = marketPrices[key] ?? investment.purchasePrice;

                    if ((investment.type === 'CEDEAR' || investment.type === 'Acción') && cclPrice) {
                      // Si el precio de mercado está en ARS pero la vista es en USD, convertir
                      if (investment.currency === 'USD' && !showInARS) {
                        currentPrice = currentPrice / cclPrice;
                      }
                      // Si la vista es en ARS, no tocar (ya está en ARS)
                    }

                    // --- NUEVA LÓGICA: el PPC usado depende de mergeTransactions ---
                    // Determinar si se agrupan transacciones
                    const isMerged = mergeTransactions;
                    const priceOfPurchase = isMerged
                      ? ppcMap[ppcKey] ?? investment.purchasePrice // PPC global ponderado
                      : investment.purchasePrice; // PPC individual de la transacción

                    let priceUnit = currentPrice;
                    let ppcUnit = priceOfPurchase;

                    // Conversiones claras y únicas (corregidas para CEDEARs y Acciones):
                    if (investment.type === 'Cripto') {
                      if (showInARS && cclPrice) {
                        priceUnit = currentPrice * cclPrice;
                        ppcUnit = ppcUnit * cclPrice;
                      }
                    } else if (investment.type === 'CEDEAR' || investment.type === 'Acción') {
                      // Si la compra fue en USD y la vista es ARS, SOLO convertir el PPC
                      if (investment.currency === 'USD' && showInARS && cclPrice) {
                        priceUnit = currentPrice; // YA está en ARS
                        ppcUnit = ppcUnit * cclPrice; // Pasar PPC de USD a ARS
                      }
                      // Si la compra fue en ARS y la vista es USD, SOLO convertir el precio actual
                      else if (investment.currency === 'ARS' && !showInARS && cclPrice) {
                        priceUnit = currentPrice / cclPrice;
                        ppcUnit = ppcUnit / cclPrice; // ✅ convertir también el PPC
                      }
                      // Si ambas en ARS o ambas en USD, no hacer nada
                    }

                    // Debug: asegurarse que ambas variables sean por unidad y en la moneda correcta
                    console.log("DEBUG CAMBIO:", {
                      ticker: investment.ticker,
                      type: investment.type,
                      priceUnit,
                      ppcUnit,
                      cantidad: investment.quantity,
                      currentPrice,
                      ppcRaw: ppcMap[ppcKey],
                      currency: investment.currency,
                      showInARS,
                      cclPrice
                    });

                    // Calcular diferencia y % SOLO por unidad, luego multiplicar por cantidad para el cambio $
                    const differencePerUnit = priceUnit - ppcUnit;
                    const priceChange = differencePerUnit * investment.quantity;
                    const priceChangePercent = ppcUnit !== 0 ? (differencePerUnit / ppcUnit) * 100 : 0;

                    // Valor de la inversión usando priceUnit (ya convertido)
                    const tenencia = priceUnit * investment.quantity;
                    const asignacion = totalTenencia > 0 ? (tenencia / totalTenencia) * 100 : 0;

                    return (
                        <tr
                            key={investment.id}
                            className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                        >
                          {/* Corazón (favorito, centrado) */}
                          {!mergeTransactions && (
                            <td className="py-4 px-4 text-center">
                              <button onClick={() => toggleFavorite(investment.id)} className="mx-auto block">
                                <Heart
                                    size={18}
                                    fill={investment.isFavorite ? '#f87171' : 'none'}
                                    className={`stroke-2 ${investment.isFavorite ? 'text-red-500' : 'text-gray-400'} hover:scale-110 transition-transform`}
                                />
                              </button>
                            </td>
                          )}
                          {/* Ticker */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <img
                                  src={predefinedAssets.find(a => a.ticker === investment.ticker)?.logo}
                                  alt={investment.ticker}
                                  className="w-5 h-5 rounded-full object-contain"
                              />
                              <span className="font-medium text-gray-800">{investment.ticker}</span>
                            </div>
                          </td>
                          {/* Nombre */}
                          <td className="py-4 px-4 text-gray-600">{investment.name}</td>
                          {/* Precio actual */}
                          <td className="py-4 px-4 text-gray-600">
                            {
                              (() => {
                                const priceToShow = marketPrices[key];
                                if (priceToShow === undefined || priceToShow === null || isNaN(priceToShow)) {
                                  return <span className="italic text-gray-400">cargando</span>;
                                }

                                let adjustedPrice = priceToShow;

                                if (investment.type === 'Cripto') {
                                  // Si es cripto y vista en ARS, multiplicar por CCL
                                  adjustedPrice = showInARS && cclPrice ? priceToShow * cclPrice : priceToShow;
                                } else if (investment.type === 'Acción' || investment.type === 'CEDEAR') {
                                  // Si es acción o CEDEAR y vista en USD, dividir por CCL
                                  adjustedPrice = !showInARS && cclPrice ? priceToShow / cclPrice : priceToShow;
                                }

                                return formatCurrency(adjustedPrice, showInARS ? 'ARS' : 'USD');
                              })()
                            }
                          </td>
                          {/* Cambio $ */}
                          <td className={`py-4 px-4 text-center ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {priceChange >= 0 ? '+' : ''}
                            {formatCurrency(priceChange, showInARS ? 'ARS' : 'USD')}
                          </td>
                          {/* Cambio % */}
                          <td className={`py-4 px-4 text-center ${priceChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {priceChangePercent >= 0 ? '+' : ''}
                            {priceChangePercent.toFixed(2)}%
                          </td>
                          {/* Cantidad */}
                          <td
                            className={`py-4 px-4 text-center ${
                              investment.quantity > 0
                                ? 'text-gray-800'
                                : 'text-red-600'
                            }`}
                          >
                            {investment.type === 'Cripto'
                              ? investment.quantity.toFixed(4)
                              : Math.round(investment.quantity)}
                          </td>
                          {/* PPC */}
                          <td className="py-4 px-4 text-gray-600 text-center">
                            {isNaN(ppcUnit)
                              ? <span className="italic text-gray-400">cargando</span>
                              : formatCurrency(ppcUnit, showInARS ? 'ARS' : 'USD')}
                          </td>
                          {/* Tenencia */}
                          <td className="py-4 px-4 text-gray-600 text-center">
                            {formatCurrency(tenencia, showInARS ? 'ARS' : 'USD')}
                          </td>
                          {/* Fecha de compra */}
                          {!mergeTransactions && (
                            <td className="py-4 px-4 text-gray-600 text-center">
                              {investment.purchaseDate
                                  ? new Date(investment.purchaseDate).toLocaleDateString('es-AR')
                                  : 'Fecha no disponible'}
                            </td>
                          )}
                          {/* Asignación */}
                          <td className="py-4 px-4">
                            <div className="flex items-center justify-center">
                              <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    activeTypeFilter === 'Todos'
                                      ? 'bg-blue-600'
                                      : activeTypeFilter === 'Cripto'
                                      ? 'bg-orange-500'
                                      : activeTypeFilter === 'CEDEAR'
                                      ? 'bg-purple-600'
                                      : 'bg-[#0EA5E9]'
                                  }`}
                                  style={{ width: `${asignacion.toFixed(2)}%` }}
                                />
                              </div>
                              <span className="text-sm text-gray-600">
                                {asignacion.toFixed(2)}%
                              </span>
                            </div>
                          </td>
                          {/* Acciones */}
                          {!mergeTransactions && (
                            <td className="py-4 px-4 flex gap-4 justify-center">
                              <button
                                  onClick={() => handleEditInvestment(investment)}
                                  className="text-yellow-500 hover:text-yellow-600 transition-colors"
                                  title="Editar esta inversión"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button
                                  onClick={() => handleDeleteInvestment(investment.id)}
                                  className="text-red-500 hover:text-red-600 transition-colors"
                                  title="Eliminar esta inversión"
                              >
                                <Trash size={18} />
                              </button>
                            </td>
                          )}
                        </tr>
                    );
                  })}
                  </tbody>
                </table>
              </div>
          ) : (
              <div className="text-center py-10">
                <p className="text-gray-500">Aún no has agregado inversiones.</p>
              </div>
          )}
          {/* Agregar inversión (botón secundario, centrado debajo de la tabla) */}
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-2"
            >
              <Plus size={16} />
              Agregar inversión
            </button>
          </div>
        </motion.div>

        {/* Add Investment Modal */}
        {showAddModal && (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            >
              <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full border border-gray-200"
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-2xl font-bold text-gray-900">
                    {editId ? "✏️ Editar inversión" : "📈 Agregar nueva inversión"}
                  </h3>
                  <button
                      onClick={() => {
                        setShowAddModal(false);
                        setEditId(null);
                        setNewInvestment({
                          ticker: '',
                          name: '',
                          type: 'CEDEAR',
                          quantity: 0,
                          purchasePrice: 0,
                          purchaseDate: new Date().toISOString().split('T')[0],
                          currency: 'ARS',
                        });
                        setSelectedAsset(null);
                        setCurrentPrice(null);
                        setAssetSearchTerm('');
                      }}
                      className="text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
                      <AlertCircle size={18} className="mr-2 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                )}

                {success && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center text-green-700">
                      <Check size={18} className="mr-2 flex-shrink-0" />
                      <span>{success}</span>
                    </div>
                )}

                <form onSubmit={handleAddInvestment} className="space-y-4">
                  {/* Tipo de inversión */}
                  <div>
                    <label htmlFor="type" className="block text-sm font-medium text-gray-800 mb-1">
                      Tipo de inversión
                    </label>
                    <select
                        id="type"
                        value={newInvestment.type}
                        onChange={(e) => {
                          const newType = e.target.value as 'Cripto' | 'CEDEAR' | 'Acción';
                          setNewInvestment((prev) => ({
                            ...prev,
                            type: newType,
                            ticker: '',
                            name: '',
                            quantity: 0,
                            purchasePrice: 0,
                            currency: newType === 'Cripto' ? 'USD' : 'ARS',
                          }));
                          setAssetSearchTerm('');
                          setSelectedAsset(null);
                          setCurrentPrice(null);
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                    >
                      <option value="CEDEAR">CEDEAR</option>
                      <option value="Acción">Acción</option>
                      <option value="Cripto">Cripto</option>
                    </select>
                  </div>
                  {/* --- Asset Selection: búsqueda e íconos --- */}
                  <div className="mb-4">
                    <label htmlFor="assetSearch" className="block text-sm font-medium text-gray-800 mb-1">
                      Seleccionar Activo
                    </label>
                    <div className="relative">
                      <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-blue-500">
                        <input
                          type="text"
                          id="assetSearch"
                          value={assetSearchTerm}
                          onChange={(e) => {
                            setAssetSearchTerm(e.target.value);
                            setSelectedAsset(null);
                          }}
                          placeholder={selectedAsset ? `${selectedAsset.name} (${selectedAsset.ticker})` : 'Buscar activo...'}
                          className="flex-1 outline-none bg-transparent text-sm text-gray-800"
                          autoComplete="off"
                        />
                      </div>
                      {(assetSearchTerm.length > 0 && filteredAssets.length > 0) && (
                        <ul className="absolute left-0 w-full z-50 bg-white border border-gray-200 mt-1 max-h-52 overflow-y-auto rounded-lg shadow-lg">
                          {filteredAssets.map((asset) => (
                            <li
                              key={asset.ticker}
                              onClick={() => {
                                handleAssetSelect(asset);
                                setSelectedAsset(asset);
                                setAssetSearchTerm('');
                              }}
                              className="flex items-center p-2 hover:bg-gray-100 cursor-pointer"
                            >
                              <img
                                src={asset.logo}
                                alt={asset.name}
                                className="w-6 h-6 rounded-full mr-2 object-contain"
                                style={{ minWidth: 24, minHeight: 24, maxWidth: 24, maxHeight: 24 }}
                              />
                              <div>
                                <p className="text-sm font-medium text-gray-800">{asset.name}</p>
                                <p className="text-xs text-gray-500">{asset.ticker}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {/* Mostrar el activo seleccionado debajo del input */}
                    {selectedAsset && (
                      <div className="flex items-center gap-3 mt-3 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                        <img
                          src={selectedAsset.logo}
                          alt={selectedAsset.name}
                          className="w-7 h-7 rounded-full object-contain"
                          style={{ minWidth: 28, minHeight: 28, maxWidth: 28, maxHeight: 28 }}
                        />
                        <div>
                          <div className="font-semibold text-gray-800">{selectedAsset.name}</div>
                          <div className="text-xs text-gray-500">{selectedAsset.ticker}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Fecha de compra */}

                  <div className="mb-4">
                    <label htmlFor="purchaseDate" className="block text-sm font-medium text-gray-800 mb-1">
                      Fecha de compra
                    </label>
                    <div className="relative">
                      <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                          type="date"
                          id="purchaseDate"
                          value={newInvestment.purchaseDate}
                          onChange={(e) =>
                              setNewInvestment((prev) => ({ ...prev, purchaseDate: e.target.value }))
                          }
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                      />
                    </div>
                  </div>


                  <div>
                    <label htmlFor="quantity" className="block text-sm font-medium text-gray-800 mb-1">
                      Cantidad
                    </label>
                    <input
                        type="number"
                        id="quantity"
                        value={newInvestment.quantity || ''}
                        step={newInvestment.type === 'Cripto' ? 'any' : '1'}
                        min="0"
                        inputMode="decimal"
                        onChange={(e) =>
                          setNewInvestment((prev) => ({
                            ...prev,
                            quantity:
                              newInvestment.type === 'Cripto'
                                ? parseFloat(e.target.value.replace(',', '.')) || 0
                                : Math.floor(Number(e.target.value.replace(',', ''))) || 0
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                    />
                    {newInvestment.quantity > 0 && newInvestment.purchasePrice > 0 && cclPrice && (
                      <div className="mt-3 px-4 py-2 rounded-md border border-gray-200 bg-gray-50 text-gray-700 text-sm">
                        Esta compra equivale actualmente a:{' '}
                        <strong className="text-gray-900">
                          {newInvestment.currency === 'USD'
                            ? `${(newInvestment.quantity * newInvestment.purchasePrice).toFixed(2)} USD`
                            : `${(newInvestment.quantity * newInvestment.purchasePrice).toFixed(2)} ARS`}
                        </strong>{' '}
                        /{' '}
                        <strong className="text-gray-900">
                          {newInvestment.currency === 'USD'
                            ? `${(newInvestment.quantity * newInvestment.purchasePrice * cclPrice).toFixed(2)} ARS`
                            : `${(newInvestment.quantity * newInvestment.purchasePrice / cclPrice).toFixed(2)} USD`}
                        </strong>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="currency" className="block text-sm font-medium text-gray-800 mb-1">
                        Moneda
                      </label>
                      <select
                          id="currency"
                          value={newInvestment.currency}
                          onChange={(e) => setNewInvestment(prev => ({ ...prev, currency: e.target.value as 'USD' | 'ARS' }))}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                      >
                        <option value="ARS">🇦🇷 ARS</option>
                        <option value="USD">🇺🇸 USD</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="purchasePrice" className="block text-sm font-medium text-gray-800 mb-1">
                        Precio de compra
                      </label>
                      <div className="relative">
                        <DollarSign size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="number"
                            id="purchasePrice"
                            value={newInvestment.purchasePrice || ''}
                            onChange={(e) =>
                              setNewInvestment(prev => ({
                                ...prev,
                                purchasePrice: parseFloat(e.target.value.replace(',', '.')) || 0
                              }))
                            }
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                            step="any"
                            min="0"
                        />
                      </div>
                      {fetchingPrice && (
                          <p className="mt-1 text-sm text-gray-500 flex items-center">
                            <Loader size={12} className="animate-spin mr-1" />
                            Obteniendo precio actual...
                          </p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                        type="button"
                        onClick={() => {
                          setShowAddModal(false);
                          setEditId(null);
                        }}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-colors flex items-center"
                    >
                      {editId ? <Edit2 size={18} className="mr-2" /> : <Plus size={18} className="mr-2" />}
                      {editId ? "Guardar cambios" : "Agregar"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
        )}
      </div>
  );
};


// Función para obtener la clave de asset (market price, etc)
const getAssetKey = (inv: Investment) => {
  return inv.type + '-' + inv.ticker.toUpperCase();
};

// Función para obtener la clave normalizada para PPC
const getNormalizedPpcKey = (inv: Investment) => {
  const normalizedType = typeof inv.type === 'string'
    ? inv.type.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    : inv.type;
  return inv.ticker.toUpperCase() + '-' + normalizedType;
};

export default Portfolio;
