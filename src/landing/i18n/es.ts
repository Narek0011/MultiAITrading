import type { Dictionary } from './en';

export const es: Dictionary = {
  meta: {
    title: 'MultiAITrading — Señales Forex con IA en Telegram',
    description: 'Señales de forex impulsadas por IA para 17 pares principales y cruzados. Entrada, take profit y stop loss con un gráfico real, directo a Telegram.',
  },
  nav: { how: 'Cómo funciona', ai: 'Análisis IA', results: 'Resultados', pairs: 'Pares', faq: 'FAQ', join: 'Obtener acceso' },
  hero: {
    badge: 'Impulsado por los modelos más recientes de OpenAI',
    title: 'Señales forex creadas por <span class="grad">IA</span>.<br/>Directo a Telegram.',
    subtitle: 'MultiAITrading analiza 17 pares de divisas sin parar, lee la acción del precio y los indicadores como un equipo de analistas y te envía solo las oportunidades que valen la pena — con entrada, objetivos, stop loss y un gráfico real.',
    ctaSignals: 'Unirme al canal de señales',
    ctaSupport: 'Hablar con soporte',
    trust: ['17 pares principales y cruzados', 'Entrada · TP1 · TP2 · SL', 'Gráfico real en cada señal'],
  },
  card: { live: 'Señal', entry: 'Entrada', tp: 'Take profit', sl: 'Stop loss', confidence: 'Confianza IA' },
  stats: { winRate: 'Tasa de acierto (cerradas)', signals: 'Señales enviadas', pairs: 'Pares cubiertos', pips: 'Pips netos', fallback: [{ value: '24/5', label: 'Escaneo del mercado' }, { value: 'TP1 · TP2 · SL', label: 'En cada señal' }, { value: 'EN · RU · ES', label: 'Idiomas de señales' }] },
  how: {
    eyebrow: 'Cómo funciona',
    title: 'De los datos del mercado a una operación clara — en segundos',
    steps: [
      { title: 'Datos de mercado', text: 'Velas actualizadas de cada par desde un proveedor profesional en la temporalidad elegida, más una temporalidad superior para el contexto de tendencia.' },
      { title: 'Análisis IA', text: 'Nuestro motor de IA evalúa tendencia, momentum, estructura y volatilidad. Si la configuración no es limpia, no se envía señal — la disciplina viene de serie.' },
      { title: 'Señal en Telegram', text: 'Recibes dirección, entrada, dos objetivos y stop loss, una breve explicación y un gráfico que coincide con el mercado real.' },
    ],
  },
  ai: {
    eyebrow: 'Análisis IA',
    title: 'Un análisis que lee el mercado como un <span class="grad">equipo de analistas</span>',
    text: 'En cada escaneo, las últimas velas y una instantánea completa de indicadores se envían a los modelos más potentes de OpenAI. El modelo debe justificar cada operación y dar una puntuación de confianza honesta — todo lo que no supera el umbral se descarta.',
    points: [
      { title: 'Contexto multi-temporalidad', text: 'Entrada en la temporalidad de la señal, tendencia confirmada en la superior.' },
      { title: 'Confluencia de indicadores', text: 'Tendencia EMA, momentum RSI, MACD y volatilidad ATR en conjunto.' },
      { title: 'Niveles según estructura', text: 'Stops tras los swings, objetivos con al menos 1:1 y 1:2.' },
      { title: 'Filtro de confianza', text: 'Solo se publican configuraciones sobre el mínimo de confianza.' },
    ],
    modelsLabel: 'Motor',
    models: ['Modelos GPT de OpenAI', 'Motor de indicadores técnicos', 'Modelo de riesgo ATR'],
  },
  features: {
    eyebrow: 'Por qué se quedan',
    title: 'Todo lo que necesitas en un mensaje',
    items: [
      { icon: 'chart', title: 'Gráfico real en cada señal', text: 'Velas, EMAs, RSI y las zonas exactas de entrada, TP y SL a partir de datos en vivo.' },
      { icon: 'target', title: 'Niveles claros', text: 'Entrada, dos objetivos y stop loss con la distancia en pips. Sin adivinar.' },
      { icon: 'bell', title: 'Resultados rastreados', text: 'Cuando se alcanza un objetivo o el stop, el bot responde a la señal original para que siempre sepas el resultado.' },
      { icon: 'clock', title: 'Según la sesión', text: 'Señales en las horas más líquidas — Londres y Nueva York — y pausa los fines de semana.' },
      { icon: 'shield', title: 'Disciplina de riesgo', text: 'Límites diarios y pausas por par evitan el sobre-trading. Calidad sobre cantidad.' },
      { icon: 'globe', title: 'English · Русский · Español', text: 'Señales y análisis en tu idioma.' },
    ],
  },
  results: { eyebrow: 'Historial', title: 'Últimas señales cerradas', pair: 'Par', side: 'Dirección', result: 'Resultado', pips: 'Pips', empty: 'Los resultados aparecerán aquí en cuanto se cierren las primeras señales.' },
  sample: { eyebrow: 'Anatomía de una señal', title: 'Esto es lo que llega a tu Telegram', caption: 'Gráfico generado automáticamente a partir de velas reales del mercado en el momento de la señal.' },
  pairs: { eyebrow: 'Cobertura', title: '17 pares de divisas, analizados sin descanso', text: 'Principales y los cruces más negociados entre USD, EUR, GBP, JPY, AUD, CAD y CHF.' },
  access: {
    eyebrow: 'Acceso',
    title: 'Tres pasos para entrar al canal privado',
    steps: [
      { title: 'Escribe a soporte', text: 'Escríbenos en Telegram — respondemos personalmente.' },
      { title: 'Regístrate con nuestro socio', text: 'Te enviamos un enlace de registro de socio para abrir tu cuenta de trading.' },
      { title: 'Te añadimos al canal', text: 'Una vez registrado, te añadimos al canal privado y empiezas a recibir señales.' },
    ],
    cta: 'Escribir a soporte',
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Preguntas frecuentes',
    items: [
      { q: '¿Cómo se generan las señales?', a: 'Un motor de IA basado en los modelos más recientes de OpenAI analiza velas actualizadas junto con EMA, RSI, MACD y ATR. Solo se publica cuando tendencia, momentum y estructura coinciden y la confianza supera el umbral.' },
      { q: '¿Qué incluye una señal?', a: 'Par y dirección (BUY/SELL), precio de entrada, dos take profit, stop loss, pips a cada nivel, temporalidad, puntuación de confianza, una breve explicación y un gráfico del mercado en vivo.' },
      { q: '¿Cuántas señales al día?', a: 'Depende del mercado. Limitamos el número diario y aplicamos pausas por par: menos ruido, más calidad.' },
      { q: '¿Qué pares cubren?', a: 'USD/CHF, CAD/JPY, AUD/USD, USD/JPY, GBP/CAD, AUD/CAD, AUD/JPY, CAD/CHF, GBP/USD, GBP/AUD, EUR/CHF, EUR/GBP, EUR/USD, USD/CAD, AUD/CHF, EUR/JPY y GBP/JPY.' },
      { q: '¿Cómo me uno?', a: 'Escribe a nuestro soporte en Telegram. Te enviaremos un enlace de registro de socio y, una vez registrado, te añadimos al canal privado de señales.' },
      { q: '¿Se garantizan ganancias?', a: 'No. Operar en forex conlleva un riesgo significativo. Las señales son análisis, no asesoramiento financiero: usa siempre stop loss y arriesga solo lo que puedas permitirte perder.' },
    ],
  },
  final: { title: '¿Listo para operar con un analista de IA a tu lado?', text: 'Únete al canal o habla con soporte — toma un minuto.' },
  footer: {
    rights: 'Todos los derechos reservados.',
    disclaimer: 'Advertencia de riesgo: operar divisas con margen conlleva un alto nivel de riesgo y puede no ser adecuado para todos los inversores. Los resultados pasados no garantizan resultados futuros. Las señales se ofrecen solo con fines informativos y no constituyen asesoramiento financiero.',
  },
  outcome: { TP1: 'TP1', TP2: 'TP2', SL: 'Stop', BE: 'Break-even' },
};
