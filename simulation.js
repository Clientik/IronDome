// Import Three.js library
//const THREE = require("three")

// Константы и переменные для симуляции
let scene, camera, renderer, controls
let target = null,
    interceptors = [],
    debris = []
const clock = new THREE.Clock()
let simulationTime = 0
let targetLaunchTime = 0
let isPaused = false

// Массив текстур для земли
const GROUND_TEXTURES = [
    'textures/desert.jpg',  // Пустыня
    'textures/forest.jpg',  // Лес
    'textures/grassland.jpg', // Степь
    'textures/mountains.jpg'  // Горы
];

// Функция для получения случайной текстуры
function getRandomGroundTexture() {
    return GROUND_TEXTURES[Math.floor(Math.random() * GROUND_TEXTURES.length)];
}

// Размер сетки и другие константы
const GRID_SIZE = 10000 // метров
let MAX_INTERCEPTORS = 5 // максимальное количество перехватчиков
const UNIVERSAL_GAS_CONSTANT = 8.31 // Дж/(моль·К)
const AIR_MOLAR_MASS = 0.0289644 // кг/моль
const TEMPERATURE = 288.15 // K (15°C)

// Фазы наведения перехватчика
const GUIDANCE_PHASES = {
    BOOST: 'BOOST',      // Фаза вертикального подъема
    MIDCOURSE: 'MIDCOURSE', // Средняя фаза наведения
    TERMINAL: 'TERMINAL'   // Терминальная фаза наведения
}

// Валидация параметров
function validateParameters() {
    const gravity = Number.parseFloat(document.getElementById("gravity").value)
    if (gravity < 0 || gravity > 20) {
        console.warn("Нереалистичное значение гравитации:", gravity)
        return false
    }

    const targetSpeed = Number.parseFloat(document.getElementById("targetSpeed").value)
    if (targetSpeed < 0 || targetSpeed > 10000) {
        console.warn("Нереалистичная скорость цели:", targetSpeed)
        return false
    }

    const targetAngle = Number.parseFloat(document.getElementById("targetAngle").value)
    if (targetAngle < 0 || targetAngle > 90) {
        console.warn("Нереалистичный угол запуска:", targetAngle)
        return false
    }

    const targetMass = Number.parseFloat(document.getElementById("targetMass").value)
    if (targetMass <= 0 || targetMass > 100000) {
        console.warn("Нереалистичная масса цели:", targetMass)
        return false
    }

    return true
}

// Изменим параметры по умолчанию для более эффективного перехвата
let systemConstants = {};

// Инициализация системных констант из выбранного типа перехвата
function initializeSystemConstants() {
    const interceptType = document.getElementById('interceptType')?.value || 'trajectory';
    systemConstants = { ...SYSTEM_CONSTANTS_PRESETS[interceptType] };
}

// === Пресеты системных констант ===
const SYSTEM_CONSTANTS_PRESETS = {
    trajectory: {
        boostTime: 0.3,
        turnDelay: 0.1,
        turnFactor: 8.0,
        navigationConstant: 25.0,
        terminalDistance: 300,
        updateInterval: 0.002,
        closeRange: 150,
        thrustDirectionFactor: 0.995,
        velocityAdjustmentRate: 0.98,
        midcourseAggressiveness: 20.0,
        trajectoryLeadFactor: 0.4,
        terminalAggressiveness: 40.0,
        interceptProbability: 0.85,
        g: 9.81,
        rho0: 1.225,
        H: 7400,
        Cd: 0.5,
        A: 0.1,
        missDistanceMultiplier: 1.1,
        missAngleThreshold: 20,
        missMaxDistance: 2000,
        hitAngleThreshold: 170,
        speedThresholdFactor: 0.98,
        turnSmoothingFactor: 0.3,
        minTurnRate: 0.3,
        maxTurnRate: 0.6,
        distanceWeight: 0.4,
        angleWeight: 0.3,
        speedWeight: 0.3,
        maxClosingSpeed: 500,
        minClosingSpeed: 50
    },
    lead: {
        boostTime: 0.5,
        turnDelay: 0.2,
        turnFactor: 8.0,
        navigationConstant: 12.0,
        terminalDistance: 800,
        updateInterval: 0.01,
        closeRange: 500,
        thrustDirectionFactor: 1.0,
        velocityAdjustmentRate: 0.7,
        midcourseAggressiveness: 20.0,
        predictionUpdateInterval: 0.01,
        trajectoryLeadFactor: 1.0,
        terminalAggressiveness: 16.0,
        interceptProbability: 1.0,
        g: 9.81,
        rho0: 1.225,
        H: 7400,
        Cd: 0.5,
        A: 0.1,
        missDistanceMultiplier: 2.0,
        missAngleThreshold: 90,
        missMaxDistance: 2000,
        hitAngleThreshold: 180,
        // Новые параметры с оптимизированными значениями для типа "опережение"
        speedThresholdFactor: 0.95, // Более агрессивный порог для сравнения скоростей
        turnSmoothingFactor: 0.6, // Менее плавные повороты для более резкого реагирования
        minTurnRate: 0.15, // Увеличенная минимальная скорость поворота
        maxTurnRate: 0.3, // Увеличенная максимальная скорость поворота
        distanceWeight: 0.3, // Меньший вес расстояния
        angleWeight: 0.4, // Больший вес угла
        speedWeight: 0.3, // Сохраняем вес скорости
        maxClosingSpeed: 800, // Увеличенная максимальная скорость сближения
        minClosingSpeed: 100 // Увеличенная минимальная скорость сближения
    }
};

// === Применение пресета к системным константам ===
function applyConstantsPreset(presetName) {
    const preset = SYSTEM_CONSTANTS_PRESETS[presetName];
    if (!preset) return;
    
    // Обновляем systemConstants
    systemConstants = { ...preset };
    
    // Обновляем значения в форме
    for (const key in preset) {
        const input = document.getElementById(`constant-${key}`);
        if (input) input.value = preset[key];
    }
    
    highlightPresetMatch(true);
}

// === Проверка совпадения с пресетом и подсветка ===
function highlightPresetMatch(force) {
  const interceptType = document.getElementById('interceptType')?.value || 'trajectory';
  const preset = SYSTEM_CONSTANTS_PRESETS[interceptType];
  let allMatch = true;
  for (const key in preset) {
    const input = document.getElementById(`constant-${key}`);
    if (input && String(input.value) !== String(preset[key])) {
      allMatch = false;
      break;
    }
  }
  const panel = document.getElementById('system-constants-panel');
  let mark = panel?.querySelector('.preset-match-mark');
  if (!mark && panel) {
    mark = document.createElement('span');
    mark.className = 'preset-match-mark';
    mark.style.marginLeft = '8px';
    mark.style.color = '#4ade80';
    mark.style.fontSize = '1.5em';
    panel.querySelector('.bis-title')?.appendChild(mark);
  }
  if (mark) mark.textContent = allMatch ? '✔' : '';
  if (!allMatch && mark && !force) mark.textContent = '';
}

// === Навешиваем обработчики ===
document.addEventListener('DOMContentLoaded', () => {
  // При смене типа перехвата — применяем пресет
  const interceptType = document.getElementById('interceptType');
  if (interceptType) {
    interceptType.addEventListener('change', () => {
      applyConstantsPreset(interceptType.value);
    });
  }
  // Кнопка сброса
  document.body.addEventListener('click', e => {
    if (e.target.closest('#reset-constants')) {
      const interceptType = document.getElementById('interceptType');
      applyConstantsPreset(interceptType?.value || 'trajectory');
    }
  });
  // При ручном изменении констант — убираем галочку
  setTimeout(() => {
    document.querySelectorAll('#constants-container input').forEach(input => {
      input.addEventListener('input', () => highlightPresetMatch(false));
    });
  }, 500);

  // === Новая логика открытия/закрытия системных констант ===
  const toggleBtn = document.getElementById('toggle-constants');
  const panel = document.getElementById('system-constants-panel');
  if (toggleBtn && panel) {
    let open = false;
    toggleBtn.onclick = () => {
      open = !open;
      if (open) {
        // Позиционируем справа от ui-panel
        const uiPanel = document.getElementById('ui-panel');
        if (uiPanel) {
          const rect = uiPanel.getBoundingClientRect();
          panel.style.left = (rect.right + 16) + 'px';
          panel.style.top = (rect.top) + 'px';
        }
        panel.style.display = 'block';
        toggleBtn.classList.add('bis-glow');
      } else {
        panel.style.display = 'none';
        toggleBtn.classList.remove('bis-glow');
      }
    };
  }
});

// Инициализация сцены
function init() {
  try {
  // Создание сцены
  scene = new THREE.Scene()
    // Убираем простой цвет фона, так как будем использовать сферу
    scene.fog = new THREE.Fog(0x87CEEB, 10000, 30000)

  // Создание сферы неба
  const skyGeometry = new THREE.SphereGeometry(GRID_SIZE * 1.5, 32, 32)
  const skyMaterial = new THREE.MeshBasicMaterial({
    color: 0x87CEEB,
    side: THREE.BackSide,
    fog: false
  })
  const sky = new THREE.Mesh(skyGeometry, skyMaterial)
  scene.add(sky)

  // Вычисление координат угла сетки
  const halfGrid = GRID_SIZE / 2
  const cornerPosition = new THREE.Vector3(0, 0, 200)
  // Создание камеры, направленной на угол сетки
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 10, 1000000)
  camera.position.set(-7500, 2600, 7200) // Позиция камеры рядом с углом не трогать

  // Создание рендерера
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.shadowMap.enabled = true
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  document.body.appendChild(renderer.domElement)

  // Добавление контролов для камеры
  controls = new THREE.OrbitControls(camera, renderer.domElement)
  controls.target.set(cornerPosition.x, cornerPosition.y, cornerPosition.z) // Направление камеры на угол сетки
  controls.update()

  // Добавление сетки (центрированной в начале координат)
  const grid = new THREE.GridHelper(GRID_SIZE, 100, 0x555555, 0x222222)
  scene.add(grid)

  // Добавление освещения
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(1000, 5000, 1000)
  directionalLight.castShadow = true
  directionalLight.shadow.mapSize.width = 2048
  directionalLight.shadow.mapSize.height = 2048
  directionalLight.shadow.camera.near = 500
  directionalLight.shadow.camera.far = 15000
  directionalLight.shadow.camera.left = -5000
  directionalLight.shadow.camera.right = 5000
  directionalLight.shadow.camera.top = 5000
  directionalLight.shadow.camera.bottom = -5000
  scene.add(directionalLight)

    // Создание текстуры земли
    const textureLoader = new THREE.TextureLoader()
    const earthTexture = textureLoader.load(getRandomGroundTexture())
    earthTexture.wrapS = THREE.RepeatWrapping
    earthTexture.wrapT = THREE.RepeatWrapping
    earthTexture.repeat.set(10, 10)

    // Добавление земли с текстурой
  const groundGeometry = new THREE.PlaneGeometry(GRID_SIZE * 2, GRID_SIZE * 2)
  const groundMaterial = new THREE.MeshStandardMaterial({
      map: earthTexture,
    roughness: 0.8,
    metalness: 0.2,
    side: THREE.DoubleSide,
  })
  const ground = new THREE.Mesh(groundGeometry, groundMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.1
  ground.receiveShadow = true
  scene.add(ground)

    // Добавляем домики
    addRandomHouses();

    // Загрузка HDR и создание скайбокса
    const rgbeLoader = new THREE.RGBELoader();
    rgbeLoader.load('818-hdri-skies-com.hdr', function(texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
        // Убираем установку фона, так как используем сферу
        // scene.background = texture;
    });

  // Обработчики событий для кнопок
  document.getElementById("startBtn").onclick = launchTarget
  document.getElementById("launchInterceptor").onclick = () => {
    if (target && interceptors.length < MAX_INTERCEPTORS) launchInterceptor()
  }
  document.getElementById("resetBtn").onclick = resetSimulation

  // Создание панели системных констант
  createSystemConstantsPanel()

  // Обработчик изменения размера окна
  window.addEventListener("resize", onWindowResize)

  // Запуск анимации
  animate()

  // Автоматический запуск симуляции после загрузки
  setTimeout(() => {
    launchTarget()
  }, 1000)

    console.log("Three.js сцена успешно инициализирована")
  } catch (error) {
    console.error("Ошибка при инициализации Three.js сцены:", error)
    showMessage("Ошибка инициализации сцены: " + error.message, "fail")
  }
}

// Добавить домики на землю
function addRandomHouses() {
  const houseCount = 20;
  const halfGrid = GRID_SIZE / 2;
  for (let i = 0; i < houseCount; i++) {
    // Случайные координаты, не слишком близко к краям
    const x = Math.random() * (GRID_SIZE - 2000) - (halfGrid - 1000);
    const z = Math.random() * (GRID_SIZE - 2000) - (halfGrid - 1000);
    const y = 0;

    // Основание дома (куб)
    const baseGeometry = new THREE.BoxGeometry(200, 120, 200);
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0xbca16b });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.set(x, 60, z);
    base.castShadow = true;
    base.receiveShadow = true;
    scene.add(base);

    // Крыша (призма)
    const roofGeometry = new THREE.ConeGeometry(140, 80, 4);
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x8b2e16 });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(x, 140, z);
    //roof.rotation.y = Math.random() * Math.PI;
    roof.rotation.y = 260;
    roof.castShadow = true;
    scene.add(roof);
  }
}

// === Система тултипов ===
const tooltipSystem = {
  init() {
    // Add tooltip styles to the document
    const style = document.createElement('style');
    style.textContent = `
      .bis-tooltip {
        position: absolute;
        background: #181818;
        border: 2px solid #ffe066;
        color: #ffe066;
        padding: 0.75rem 1.25rem;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 0.9rem;
        z-index: 1000;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
        max-width: 300px;
        white-space: normal;
        word-wrap: break-word;
      }
    `;
    document.head.appendChild(style);

    // Add tooltip container to the document
    const tooltipContainer = document.createElement('div');
    tooltipContainer.id = 'tooltip-container';
    tooltipContainer.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 1000;
    `;
    document.body.appendChild(tooltipContainer);

    // Add tooltip element
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'bis-tooltip';
    tooltipContainer.appendChild(this.tooltip);

    // Add event listeners for elements with data-tooltip attribute
    document.addEventListener('mouseover', (e) => {
      const element = e.target.closest('[data-tooltip]');
      if (element) {
        const tooltipText = element.getAttribute('data-tooltip');
        if (tooltipText) {
          this.show(element, tooltipText);
        }
      }
    });

    document.addEventListener('mouseout', (e) => {
      const element = e.target.closest('[data-tooltip]');
      if (element) {
        this.hide();
      }
    });

    // Update tooltip position on mouse move
    document.addEventListener('mousemove', (e) => {
      if (this.activeElement) {
        this.updatePosition(e);
      }
    });
  },

  show(element, tooltipText) {
    this.activeElement = element;
    this.tooltip.textContent = tooltipText;
    this.tooltip.style.opacity = '1';
    this.updatePosition();
  },

  hide() {
    this.tooltip.style.opacity = '0';
    this.activeElement = null;
  },

  updatePosition(e) {
    if (!this.activeElement) return;

    const rect = this.activeElement.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    
    // Position tooltip below the element
    let left = rect.left;
    let top = rect.bottom + 10;

    // Adjust if tooltip would go off screen
    if (left + tooltipRect.width > window.innerWidth) {
      left = window.innerWidth - tooltipRect.width - 10;
    }
    if (top + tooltipRect.height > window.innerHeight) {
      top = rect.top - tooltipRect.height - 10;
    }

    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }
};

// Создание панели системных констант
function createSystemConstantsPanel() {
    const template = document.getElementById('system-constants-panel-template');
    const panelFragment = template.content.cloneNode(true);
    document.body.appendChild(panelFragment);
    const panelElement = document.getElementById('system-constants-panel');
    
    const constantsContainer = document.getElementById('constants-container');
    const constants = [
        { name: 'boostTime', value: 1.0, description: 'Продолжительность начальной фазы вертикального подъема ракеты (в секундах)' },
        { name: 'turnDelay', value: 0.8, description: 'Задержка перед началом поворота ракеты к цели (в секундах)' },
        { name: 'turnFactor', value: 5.0, description: 'Коэффициент усиления маневренности при повороте (больше = резче поворот)' },
        { name: 'navigationConstant', value: 6.0, description: 'Константа пропорционального наведения (N) для метода PN (больше = агрессивнее)' },
        { name: 'terminalDistance', value: 1500, description: 'Расстояние до цели для перехода в терминальную фазу наведения (в метрах)' },
        { name: 'updateInterval', value: 0.01, description: 'Интервал между обновлениями расчета точки перехвата (в секундах)' },
        { name: 'closeRange', value: 1000, description: 'Расстояние, на котором увеличивается агрессивность наведения (в метрах)' },
        { name: 'thrustDirectionFactor', value: 0.9, description: 'Фактор влияния направления на тягу (0-1, где 1 = полное влияние)' },
        { name: 'velocityAdjustmentRate', value: 0.3, description: 'Скорость корректировки вектора скорости (0-1, где 1 = мгновенная корректировка)' },
        { name: 'midcourseAggressiveness', value: 12.0, description: 'Агрессивность поворота в фазе MIDCOURSE (больше = резче поворот)' },
        { name: 'predictionUpdateInterval', value: 0.05, description: 'Интервал обновления прогнозируемой траектории (в секундах)' },
        { name: 'trajectoryLeadFactor', value: 0.6, description: 'Фактор упреждения для расчета точки перехвата (0-1, где 1 = максимальное упреждение)' },
        { name: 'terminalAggressiveness', value: 8.0, description: 'Агрессивность наведения в терминальной фазе (больше = резче маневры)' },
        { name: 'interceptProbability', value: 0.85, description: 'Шанс успешного перехвата (0-1, где 1 = всегда, 0 = никогда)' },
        { name: 'g', value: 9.81, description: 'Ускорение свободного падения (м/с²)' },
        { name: 'rho0', value: 1.225, description: 'Плотность воздуха на уровне моря (кг/м³)' },
        { name: 'H', value: 7400, description: 'Масштаб высоты атмосферы (м)' },
        { name: 'Cd', value: 0.5, description: 'Коэффициент аэродинамического сопротивления' },
        { name: 'A', value: 0.1, description: 'Площадь поперечного сечения (м²)' },
        { name: 'missDistanceMultiplier', value: 1.5, description: 'Множитель расстояния для промаха по углу' },
        { name: 'missAngleThreshold', value: 15, description: 'Пороговое значение угла для промаха' },
        { name: 'missMaxDistance', value: 2000, description: 'Максимальное удаление по углу (м), после которого перехватчик считается промахнувшимся' },
        { name: 'hitAngleThreshold', value: 170, description: 'Порог угла для попадания (в градусах): если угол между скоростью и направлением на цель меньше этого значения — попадание возможно' },
        // Новые параметры
        { name: 'speedThresholdFactor', value: 0.98, description: 'Пороговый коэффициент для сравнения скоростей перехватчика и цели (0-1)' },
        { name: 'turnSmoothingFactor', value: 0.8, description: 'Фактор сглаживания поворотов (0-1, где 1 = максимальное сглаживание)' },
        { name: 'minTurnRate', value: 0.1, description: 'Минимальная скорость поворота (рад/с)' },
        { name: 'maxTurnRate', value: 0.2, description: 'Максимальная скорость поворота (рад/с)' },
        { name: 'distanceWeight', value: 0.4, description: 'Вес фактора расстояния при расчете вероятности попадания (0-1)' },
        { name: 'angleWeight', value: 0.3, description: 'Вес фактора угла при расчете вероятности попадания (0-1)' },
        { name: 'speedWeight', value: 0.3, description: 'Вес фактора скорости при расчете вероятности попадания (0-1)' },
        { name: 'maxClosingSpeed', value: 500, description: 'Максимальная скорость сближения для расчета вероятности попадания (м/с)' },
        { name: 'minClosingSpeed', value: 50, description: 'Минимальная скорость сближения для расчета вероятности попадания (м/с)' }
    ];

    constants.forEach(constant => {
        const inputTemplate = document.getElementById('constant-input-template');
        const inputFragment = inputTemplate.content.cloneNode(true);
        const inputContainer = inputFragment.querySelector('div');
        
        const label = inputContainer.querySelector('label');
        label.textContent = constant.name;
        
        const input = inputContainer.querySelector('input');
        input.id = `constant-${constant.name}`;
        input.value = constant.value;
        input.min = "0";
        input.step = "0.01";
        
        // Добавляем атрибут data-tooltip для кнопки с вопросом
        const helpButton = inputContainer.querySelector('button');
        helpButton.setAttribute('data-tooltip', constant.description);
        
        constantsContainer.appendChild(inputContainer);
    });

    // Добавляем обработчик для кнопки переключения
    const toggleBtn = document.getElementById('toggle-constants');
    if (toggleBtn) {
        let isOpen = false;
        toggleBtn.addEventListener('click', () => {
            isOpen = !isOpen;
            panelElement.style.display = isOpen ? 'block' : 'none';
            toggleBtn.style.transform = isOpen ? 'rotate(180deg)' : 'none';
        });
    }

    // Применяем пресет после создания панели
    const interceptType = document.getElementById('interceptType')?.value || 'trajectory';
    applyConstantsPreset(interceptType);
}

// Инициализируем систему тултипов при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    tooltipSystem.init();
    
    // Обновляем позицию тултипа при изменении размера окна
    window.addEventListener('resize', () => {
        tooltipSystem.updatePosition();
    });
});

// Обработчик изменения размера окна
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

// Очистка сцены от объектов симуляции
function clearScene() {
    // Удаляем финальное сообщение при сбросе
    const existingMessage = document.querySelector('.final-message');
    if (existingMessage) {
        existingMessage.remove();
    }

    isPaused = false;
    const pauseBtn = document.getElementById('pauseBtn');
    pauseBtn.textContent = '⏸ Пауза';
    pauseBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
    pauseBtn.classList.add('bg-yellow-600', 'hover:bg-yellow-700');

  for (const obj of [...interceptors, ...debris]) {
    if (!obj) continue
    scene.remove(obj.mesh)
    if (obj.line) scene.remove(obj.line)
    if (obj.predictedLine) scene.remove(obj.predictedLine)
    if (obj.marker) scene.remove(obj.marker)
    if (obj.phaseText && obj.phaseText.sprite) scene.remove(obj.phaseText.sprite)
    if (obj.directionHelper) scene.remove(obj.directionHelper)
    if (obj.numberText && obj.numberText.sprite) scene.remove(obj.numberText.sprite)
  }

  if (target) {
    scene.remove(target.mesh)
    if (target.line) scene.remove(target.line)
  }

  interceptors = []
  debris = []
  target = null

  // Сброс статистики
  document.getElementById("target-height").textContent = "-"
  document.getElementById("target-velocity").textContent = "-"
  document.getElementById("target-distance").textContent = "-"
  document.getElementById("target-time").textContent = "-"
  document.getElementById("active-interceptors").textContent = "0"

  // Сброс сообщения
  document.getElementById("message").style.display = "none"

  // Отключение кнопки запуска перехватчика
  document.getElementById("launchInterceptor").disabled = true

  // Очистка кэша
  airDensityCache.clear()
}

// Полный сброс симуляции
function resetSimulation() {
  clearScene()
  simulationTime = 0
  clock.start()
}

// Кэш для расчетов плотности воздуха
const airDensityCache = new Map()
const CACHE_STEP = 100 // метров

// Расчет плотности воздуха по барометрической формуле
function airDensity(y) {
    // Округляем высоту до ближайшего шага кэша
    const cacheKey = Math.round(y / CACHE_STEP) * CACHE_STEP
    
    // Проверяем кэш
    if (airDensityCache.has(cacheKey)) {
        return airDensityCache.get(cacheKey)
    }

    const atmosphereModel = document.getElementById("atmosphereModel").value

    if (atmosphereModel === "none") {
        return 0 // Вакуум
    }

    const rho0 = Number.parseFloat(document.getElementById("rho0").value)
    const h = Number.parseFloat(document.getElementById("atmosphereHeight").value)
    
    // Проверка на реалистичные значения
    if (h <= 0 || h > 100000) {
        console.warn("Нереалистичная высота атмосферы:", h)
        return rho0
    }

    // Барометрическая формула с учетом температуры
    const temperature = TEMPERATURE * Math.exp(-y / (7 * h)) // Упрощенная модель изменения температуры
    const density = rho0 * Math.exp(-y / h) * (TEMPERATURE / temperature)
    
    // Сохраняем в кэш
    airDensityCache.set(cacheKey, density)
    
    return density
}

// Создание линии для траектории
function makeLine(color, width = 3) {
  const material = new THREE.LineBasicMaterial({
    color,
    linewidth: width,
    transparent: true,
    opacity: 0.8,
  })
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()])
  const line = new THREE.Line(geometry, material)
  scene.add(line)
  return line
}

// Создадим функцию для создания пунктирной линии прогнозируемой траектории
function makeDashedLine(color, width = 3) {
  const material = new THREE.LineDashedMaterial({
    color,
    linewidth: width,
    scale: 1,
    dashSize: 10,
    gapSize: 5,
    transparent: true,
    opacity: 0.6,
  })
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()])
  const line = new THREE.Line(geometry, material)
  line.computeLineDistances()
  scene.add(line)
  return line
}

// Создание маркера для точки упреждения
function makeMarker(pos, color = 0xffff00) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
  })
  const geometry = new THREE.SphereGeometry(30, 16, 16)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(pos)
  scene.add(mesh)
  return mesh
}

// Создание визуализатора направления
function makeDirectionHelper(pos, dir, length = 200, color = 0xff0000) {
  const origin = pos.clone()
  const direction = dir.clone().normalize().multiplyScalar(length)
  const arrowHelper = new THREE.ArrowHelper(direction.normalize(), origin, length, color, 30, 15)
  scene.add(arrowHelper)
  return arrowHelper
}

// Функция для безопасного получения числового значения из input
function getNumericInput(id, min, max, defaultValue) {
    const input = document.getElementById(id)
    if (!input) {
        console.error(`Input с id ${id} не найден`)
        return defaultValue
    }
    
    const value = Number.parseFloat(input.value)
    if (isNaN(value)) {
        console.warn(`Некорректное значение для ${id}, используется значение по умолчанию: ${defaultValue}`)
        return defaultValue
    }
    
    if (value < min || value > max) {
        console.warn(`Значение ${value} для ${id} вне допустимого диапазона [${min}, ${max}], используется значение по умолчанию: ${defaultValue}`)
        return defaultValue
    }
    
    return value
}

// Запуск цели (баллистической ракеты) из угла по диагонали
function launchTarget() {
    try {
        clearScene()
        simulationTime = 0
        targetLaunchTime = 0
        clock.start()

        // Получение и валидация параметров цели
        const speed = getNumericInput("targetSpeed", 0, 10000, 1000)
        const angle = THREE.MathUtils.degToRad(getNumericInput("targetAngle", 0, 90, 45))
        const mass = getNumericInput("targetMass", 0, 100000, 1000)
        const cd = getNumericInput("targetCd", 0, 2, 0.5)
        const area = getNumericInput("targetArea", 0, 100, 0.1)

        // Стартовая позиция в углу сетки
        const halfGrid = GRID_SIZE / 2
        const startPosition = new THREE.Vector3(-halfGrid, 0, -halfGrid)

        // Направление по диагонали к противоположному углу
        const endPosition = new THREE.Vector3(halfGrid, 0, halfGrid)
        const dir = endPosition.clone().sub(startPosition).normalize()

        // Расчет начального вектора скорости
        const velocity = dir.clone().multiplyScalar(speed * Math.cos(angle))
        velocity.y = speed * Math.sin(angle)

        // Создание меша для цели
        const geometry = new THREE.ConeGeometry(40, 120, 16)
        const material = new THREE.MeshStandardMaterial({
            color: 0xff3333,
            metalness: 0.7,
            roughness: 0.3,
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.castShadow = true
        mesh.position.copy(startPosition)
        scene.add(mesh)

        // Создание линии для траектории
        const line = document.getElementById("showTrajectories").checked ? makeLine(0xff3333, 2) : null

        // Создание объекта цели
        target = {
            mesh,
            velocity,
            mass,
            cd,
            area,
            trail: [],
            line,
            launchTime: simulationTime,
            initialPosition: startPosition.clone(),
            maxHeight: 0,
            maxDistance: 0,
        }

        // Включение кнопки запуска перехватчика
        document.getElementById("launchInterceptor").disabled = false

        // Скрытие сообщения
        document.getElementById("message").style.display = "none"
        
    } catch (error) {
        console.error("Ошибка при запуске цели:", error)
        showMessage("Ошибка при запуске цели. Проверьте параметры.", false)
    }
}

// Добавим функцию для прогнозирования траектории перехватчика
function predictInterceptorTrajectory(interceptor, targetPos, steps = 100) {
  const gravity = Number.parseFloat(document.getElementById("gravity").value)
  const trajectory = []

  // Начальные условия
  const pos = interceptor.mesh.position.clone()
  const vel = interceptor.velocity.clone()
  const mass = interceptor.mass
  const cd = interceptor.cd
  const area = interceptor.area
  const thrust = interceptor.thrust
  let remainingBurn = interceptor.burn

  // Шаг времени для симуляции
  const totalTime = 10 // Прогнозируем на 10 секунд вперед
  const dt = totalTime / steps

  // Добавляем начальную позицию
  trajectory.push(pos.clone())

  // Симулируем движение
  for (let i = 0; i < steps; i++) {
    // Расчет плотности воздуха
    const rho = airDensity(pos.y)

    // Расчет силы сопротивления воздуха
    const dragMagnitude = 0.5 * rho * cd * area * vel.lengthSq()
    const drag = vel
        .clone()
        .normalize()
        .multiplyScalar(-dragMagnitude / mass)

    // Расчет направления на цель
    const dirToTarget = targetPos.clone().sub(pos).normalize()

    // Расчет силы тяги (если осталось время горения)
    let thrustForce = new THREE.Vector3()
    if (remainingBurn > 0) {
      // Применяем тягу в направлении к цели
      thrustForce = dirToTarget.multiplyScalar(thrust / mass)
      remainingBurn -= dt
    }

    // Суммарное ускорение
    const acceleration = new THREE.Vector3()
    acceleration.add(drag)
    acceleration.add(thrustForce)
    acceleration.add(new THREE.Vector3(0, -gravity, 0))

    // Применение ускорения
    vel.add(acceleration.multiplyScalar(dt))

    // Обновление позиции
    pos.add(vel.clone().multiplyScalar(dt))

    // Если достигли земли, прекращаем симуляцию
    if (pos.y <= 0) {
      pos.y = 0
      trajectory.push(pos.clone())
      break
    }

    // Добавляем точку в траекторию
    trajectory.push(pos.clone())
  }

  return trajectory
}

// Добавим функцию для создания текста фазы наведения
function createPhaseText(interceptor) {
  if (!document.getElementById("showPhases").checked) return null;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.font = "bold 24px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("BOOST", canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.8,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(200, 50, 1);
  scene.add(sprite);

  return {
    sprite,
    canvas,
    context,
    texture,
  };
}

// Добавим функцию для создания номера перехватчика
function createInterceptorNumber(interceptor, number) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.font = "bold 20px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`#${number}`, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.8,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(100, 25, 1);
  scene.add(sprite);

  return {
    sprite,
    canvas,
    context,
    texture,
  };
}

// Обновим функцию launchInterceptor
function launchInterceptor() {
  const activeCount = interceptors.filter(i => i.active).length;
  if (activeCount >= MAX_INTERCEPTORS) {
    showMessage("Достигнут лимит перехватчиков", "fail");
    return;
  }
  
  // Случайная позиция запуска на земле (в пределах сетки)
  const halfGrid = GRID_SIZE / 2
  const x = Math.random() * GRID_SIZE - halfGrid
  const z = Math.random() * GRID_SIZE - halfGrid
  const pos = new THREE.Vector3(x, 0, z)

  // Получение параметров перехватчика из формы
  const mass = Number.parseFloat(document.getElementById("mass").value)
  const cd = Number.parseFloat(document.getElementById("cd").value)
  const area = Number.parseFloat(document.getElementById("area").value)
  const thrust = Number.parseFloat(document.getElementById("thrust").value)
  const burn = Number.parseFloat(document.getElementById("burn").value)
  const v0 = Number.parseFloat(document.getElementById("v0").value)
  const maneuverability = THREE.MathUtils.degToRad(Number.parseFloat(document.getElementById("maneuverability").value))

  // Параметры наведения
  const maxCorrections = Number.parseFloat(document.getElementById("maxCorrections").value) || 20

  // Начальное направление на цель с упреждением
  const gravity = Number.parseFloat(document.getElementById("gravity").value)
  const predictedPos = predictInterceptionPoint(
      pos,
      new THREE.Vector3(0, v0, 0), // Начальная вертикальная скорость для расчета
      target.mesh.position,
      target.velocity,
      gravity,
  )

  // Начальное направление - строго вверх
  const velocity = new THREE.Vector3(0, v0, 0)

  // Создание меша для перехватчика
  const geometry = new THREE.ConeGeometry(30, 90, 16)
  const material = new THREE.MeshStandardMaterial({
    color: 0x33ff33,
    metalness: 0.7,
    roughness: 0.3,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.position.copy(pos)
  scene.add(mesh)

  // Создание линии для траектории и маркера для точки упреждения
  const line = document.getElementById("showTrajectories").checked ? makeLine(0x33ff33) : null
  const marker = document.getElementById("showPrediction").checked ? makeMarker(predictedPos) : null

  // Создаем пунктирную линию для прогнозируемой траектории
  const predictedLine = document.getElementById("showTrajectories").checked ? makeDashedLine(0x9933cc, 2) : null
  if (predictedLine) {
      predictedLine.visible = true;
  }

  // Создаем текст для отображения фазы
  const phaseText = createPhaseText()

  // Создаем визуализатор направления
  const directionHelper = systemConstants.debugMode
      ? makeDirectionHelper(pos, new THREE.Vector3(0, 1, 0), 200, 0x00ff00)
      : null

  // Получение типа перехвата
  const interceptType = document.getElementById('interceptType')?.value || 'trajectory';
  let leadPoint = null;
  if (interceptType === 'lead') {
    // leadPoint вычисляется один раз
    leadPoint = predictInterceptionPoint(
      pos,
      new THREE.Vector3(0, v0, 0),
      target.mesh.position,
      target.velocity,
      gravity,
    );
  }

  // Создание объекта перехватчика с улучшенными параметрами
  const interceptorObj = {
    mesh,
    velocity,
    mass,
    cd,
    area,
    thrust,
    burn,
    trail: [],
    line,
    predictedLine,
    active: true,
    marker,
    maneuverability,
    launchTime: simulationTime,
    initialPosition: pos.clone(),
    lastUpdateTime: simulationTime,
    updateInterval: systemConstants.updateInterval,
    targetPos: predictedPos.clone(),
    lastTargetPos: null,
    correctionFactor: 1.0,
    correctionCount: 0,
    maxCorrections: 999999,
    navigationConstant: systemConstants.navigationConstant,
    guidancePhase: GUIDANCE_PHASES.BOOST,
    initialTargetPos: target.mesh.position.clone(),
    initialTargetVel: target.velocity.clone(),
    lastLOS: null,
    boostTime: systemConstants.boostTime,
    turnStarted: false,
    turnDelay: systemConstants.turnDelay,
    phaseText: phaseText,
    phaseChangeTime: 0,
    directionHelper: directionHelper,
    desiredDirection: new THREE.Vector3(0, 1, 0),
    lastTrailUpdateTime: 0,
    trailUpdateInterval: 0.1,
    lastPredictionUpdateTime: 0,
    predictionUpdateInterval: 0.1,
    minDistanceToTarget: Infinity,
    interceptType,
    leadPoint,
    missAnalysis: null, // Добавляем поле для хранения анализа промаха
  }

  // Создаем номер перехватчика после создания объекта
  interceptorObj.numberText = createInterceptorNumber(interceptorObj, interceptors.length + 1);

  // Прогнозируем начальную траекторию
  if (interceptorObj.predictedLine) {
    const trajectory = predictInterceptorTrajectory(interceptorObj, predictedPos)
    interceptorObj.predictedLine.geometry.setFromPoints(trajectory)
    interceptorObj.predictedLine.computeLineDistances()
    interceptorObj.predictedLine.visible = true
  }

  interceptors.push(interceptorObj)

  // Обновление счетчика активных перехватчиков
  document.getElementById("active-interceptors").textContent = interceptors.filter((i) => i.active).length
}

// Улучшенная функция поворота вектора скорости с учетом ограничения маневренности
function steerTowards(current, desired, maxTurn, dt, aggressiveness = 1.0) {
    // Нормализация векторов
    const currentDir = current.clone().normalize();
    const desiredDir = desired.clone().normalize();

    // Угол между текущим и желаемым направлением
    const angle = currentDir.angleTo(desiredDir);

    // Применяем сглаживание к агрессивности
    const smoothedAggressiveness = Math.min(1.0, 
        aggressiveness * systemConstants.turnSmoothingFactor);

    // Ограничиваем скорость поворота
    const turnRate = Math.min(
        systemConstants.maxTurnRate,
        Math.max(systemConstants.minTurnRate, 
            maxTurn * dt * smoothedAggressiveness)
    );

    // Если угол меньше скорости поворота, возвращаем желаемое направление
    if (angle < turnRate) {
        return desiredDir;
    }

    // Иначе поворачиваем на максимально возможный угол
    const axis = new THREE.Vector3()
        .crossVectors(currentDir, desiredDir)
        .normalize();
    const quaternion = new THREE.Quaternion()
        .setFromAxisAngle(axis, turnRate);
    return currentDir.clone()
        .applyQuaternion(quaternion)
        .normalize();
}

// Улучшенная функция прогнозирования точки перехвата
function predictInterceptionPoint(interceptorPos, interceptorVel, targetPos, targetVel, gravity) {
    // Получение типа перехвата
    const interceptType = document.getElementById('interceptType')?.value || 'trajectory';

    if (interceptType === 'lead') {
        // --- Новый алгоритм "Опережение" ---
        // 1. Рассчитываем точку пересечения траекторий (решаем задачу о встрече)
        // 2. Если скорость перехватчика меньше скорости цели, летим сразу на эту точку
        // 3. Вблизи цели (killRadius*2) резко меняем курс на цель (имитируем подрыв)

        // Параметры
        const interceptorSpeed = interceptorVel.length() || Number(document.getElementById('v0')?.value) || 1;
        const targetSpeed = targetVel.length();
        const relPos = targetPos.clone().sub(interceptorPos);
        const relVel = targetVel.clone().sub(interceptorVel);
        const killRadius = Number(document.getElementById('killRadius')?.value) || 20;

        // Решаем квадратичное уравнение на время встречи
        const a = relVel.lengthSq() - interceptorSpeed * interceptorSpeed;
        const b = 2 * relPos.dot(relVel);
        const c = relPos.lengthSq();
        let t = 0;
        if (Math.abs(a) < 1e-6) {
            t = -c / b;
        } else {
            const D = b * b - 4 * a * c;
            if (D < 0) t = 0;
            else {
                const t1 = (-b + Math.sqrt(D)) / (2 * a);
                const t2 = (-b - Math.sqrt(D)) / (2 * a);
                t = Math.max(t1, t2, 0);
            }
        }
        t = Math.max(t, 0.1);
        
        // Предсказанная точка встречи
        const leadPoint = targetPos.clone().add(targetVel.clone().multiplyScalar(t));
        
        // Если скорость перехватчика меньше скорости цели, летим только на leadPoint
        if (interceptorSpeed < targetSpeed * systemConstants.speedThresholdFactor) {
            return leadPoint;
        }
        
        // Если близко к цели — возвращаем текущую позицию цели (имитация подрыва)
        if (relPos.length() < killRadius * 2) {
            return targetPos.clone();
        }
        
        // В остальных случаях — летим на leadPoint
        return leadPoint;
    }

    // --- Старый алгоритм "Траектория" ---
    // Получение параметров из формы
    const targetMass = Number.parseFloat(document.getElementById("targetMass").value);
    const targetCd = Number.parseFloat(document.getElementById("targetCd").value);
    const targetArea = Number.parseFloat(document.getElementById("targetArea").value);

    const interceptorMass = Number.parseFloat(document.getElementById("mass").value);
    const interceptorThrust = Number.parseFloat(document.getElementById("thrust").value);
    const interceptorBurn = Number.parseFloat(document.getElementById("burn").value);

    // Оценка времени до перехвата (начальное приближение)
    const distance = targetPos.clone().sub(interceptorPos).length();
    const interceptorSpeed = interceptorVel.length();
    let t = distance / Math.max(interceptorSpeed, 100);

    // Итеративное уточнение точки перехвата
    for (let i = 0; i < 15; i++) {
        // Прогнозируем будущую позицию цели с учетом гравитации и сопротивления воздуха
        const futureTargetPos = new THREE.Vector3();
        const futureTargetVel = targetVel.clone();

        // Моделируем движение цели на время t с маленьким шагом
        const steps = 30;
        const dt = t / steps;
        const simPos = targetPos.clone();
        const simVel = targetVel.clone();

        for (let step = 0; step < steps; step++) {
            // Расчет плотности воздуха на текущей высоте
            const rho = airDensity(simPos.y);

            // Расчет силы сопротивления воздуха для цели
            const dragMagnitude = 0.5 * rho * targetCd * targetArea * simVel.lengthSq();
            const drag = simVel
                .clone()
                .normalize()
                .multiplyScalar(-dragMagnitude / targetMass);

            // Применение силы сопротивления и гравитации
            simVel.add(drag.multiplyScalar(dt));
            simVel.y -= gravity * dt;

            // Обновление позиции
            simPos.add(simVel.clone().multiplyScalar(dt));

            // Если цель достигла земли, прекращаем симуляцию
            if (simPos.y <= 0) {
                simPos.y = 0;
                break;
            }
        }

        futureTargetPos.copy(simPos);

        // Оценка будущей скорости перехватчика с учетом тяги
        const burnTime = Math.min(t, interceptorBurn);
        const avgAcceleration = (interceptorThrust / interceptorMass) * (burnTime / t);
        const estimatedInterceptorSpeed = interceptorSpeed + avgAcceleration * t;

        // Расчет нового времени перехвата
        const newDistance = futureTargetPos.clone().sub(interceptorPos).length();
        const newT = newDistance / ((interceptorSpeed + estimatedInterceptorSpeed) / 2);

        // Если время сходится, прекращаем итерации
        if (Math.abs(t - newT) < 0.05) {
            break;
        }

        t = (t + newT) / 2; // Усреднение для стабильности
    }

    // Финальный прогноз позиции цели
    const finalTargetPos = new THREE.Vector3();
    const finalTargetVel = targetVel.clone();

    // Моделируем движение цели на время t с маленьким шагом
    const steps = 30;
    const dt = t / steps;
    const simPos = targetPos.clone();
    const simVel = targetVel.clone();

    for (let step = 0; step < steps; step++) {
        // Расчет плотности воздуха на текущей высоте
        const rho = airDensity(simPos.y);

        // Расчет силы сопротивления воздуха для цели
        const dragMagnitude = 0.5 * rho * targetCd * targetArea * simVel.lengthSq();
        const drag = simVel
            .clone()
            .normalize()
            .multiplyScalar(-dragMagnitude / targetMass);

        // Применение силы сопротивления и гравитации
        simVel.add(drag.multiplyScalar(dt));
        simVel.y -= gravity * dt;

        // Обновление позиции
        simPos.add(simVel.clone().multiplyScalar(dt));

        // Если цель достигла земли, прекращаем симуляцию
        if (simPos.y <= 0) {
            simPos.y = 0;
            break;
        }
    }

    finalTargetPos.copy(simPos);

    // Применяем фактор упреждения для расчета точки перехвата
    const leadFactor = systemConstants.trajectoryLeadFactor;
    const currentToTarget = finalTargetPos.clone().sub(targetPos);
    const leadPoint = targetPos.clone().add(currentToTarget.multiplyScalar(leadFactor));

    return leadPoint;
}

// Обновление ориентации объекта по направлению движения
function updateOrientation(object, velocity) {
  if (velocity.length() < 0.1) return

  // Создание направления "вперед" (по умолчанию для конуса это ось Y)
  const forward = new THREE.Vector3(0, 1, 0)

  // Получение направления скорости
  const direction = velocity.clone().normalize()

  // Создание кватерниона для поворота
  object.quaternion.setFromUnitVectors(forward, direction)
}

// Изменим функцию animate для учета паузы
function animate() {
  requestAnimationFrame(animate)

  if (isPaused) {
    renderer.render(scene, camera)
    return
  }

  // Расчет дельты времени
  const dt = Math.min(clock.getDelta(), 0.1) // Ограничение dt для стабильности
  simulationTime += dt

  // Получение значения гравитации из формы
  const gravity = Number.parseFloat(document.getElementById("gravity").value)

  // Обновление цели
  if (target) {
    // Расчет плотности воздуха на текущей высоте
    const rho = airDensity(target.mesh.position.y)

    // Расчет силы сопротивления воздуха: F = 0.5 * ρ * Cd * S * v^2
    const dragMagnitude = 0.5 * rho * target.cd * target.area * target.velocity.lengthSq()
    const drag = target.velocity
        .clone()
        .normalize()
        .multiplyScalar(-dragMagnitude / target.mass)

    // Применение силы сопротивления и гравитации
    target.velocity.add(drag.multiplyScalar(dt))
    target.velocity.y -= gravity * dt

    // Обновление позиции
    target.mesh.position.add(target.velocity.clone().multiplyScalar(dt))

    // Обновление ориентации
    updateOrientation(target.mesh, target.velocity)

    // Обновление траектории
    target.trail.push(target.mesh.position.clone())
    if (target.line) {
      target.line.geometry.setFromPoints(target.trail)
    }

    // Обновление максимальной высоты и расстояния
    target.maxHeight = Math.max(target.maxHeight, target.mesh.position.y)
    const horizontalDistance = new THREE.Vector2(
        target.mesh.position.x - target.initialPosition.x,
        target.mesh.position.z - target.initialPosition.z,
    ).length()
    target.maxDistance = Math.max(target.maxDistance, horizontalDistance)

    // Проверка столкновения с землей
    if (target.mesh.position.y <= 0) {
      showMessage("НЕУДАЧНО: Цель достигла земли", false);

      // Создание эффекта взрыва
      createExplosion(target.mesh.position, 0xff5555, 200)

      // Удаление цели
      scene.remove(target.mesh)
      if (target.line) scene.remove(target.line)
      target = null

      // Отключение кнопки запуска перехватчика
      document.getElementById("launchInterceptor").disabled = true

      // Показываем финальное сообщение с задержкой
      setTimeout(() => {
        isPaused = true;
        clock.stop();
        showFinalMessage("ПРОИГРЫШ: Цель достигла земли!", false);
      }, 1000);
    }

    // Обновление статистики цели
    if (target) {
      document.getElementById("target-height").textContent = `${Math.round(target.mesh.position.y)} м`
      document.getElementById("target-velocity").textContent = `${Math.round(target.velocity.length())} м/с`
      document.getElementById("target-distance").textContent = `${Math.round(target.maxDistance)} м`
      document.getElementById("target-time").textContent = `${(simulationTime - target.launchTime).toFixed(1)} с`
      updateHitChanceUI();
    }
  }

  // Обновление перехватчиков с улучшенным алгоритмом наведения
  interceptors.forEach((interceptor, index) => {
    if (!interceptor.active || !target) return

    // Расчет расстояния до цели
    const dist = interceptor.mesh.position.distanceTo(target.mesh.position)

    // Время полета перехватчика
    const flightTime = simulationTime - interceptor.launchTime

    // Предыдущая фаза для отслеживания изменений
    const prevPhase = interceptor.guidancePhase

    // Обновление фазы наведения на основе времени полета и расстояния
    if (flightTime < interceptor.boostTime) {
      interceptor.guidancePhase = GUIDANCE_PHASES.BOOST
    } else if (!interceptor.turnStarted && flightTime >= interceptor.turnDelay) {
      // Начинаем поворот после задержки
      interceptor.turnStarted = true
      interceptor.guidancePhase = GUIDANCE_PHASES.MIDCOURSE
      interceptor.phaseChangeTime = simulationTime
    } else if (dist < systemConstants.terminalDistance && interceptor.turnStarted) {
      interceptor.guidancePhase = GUIDANCE_PHASES.TERMINAL
    }

    // Если фаза изменилась, обновляем время изменения
    if (prevPhase !== interceptor.guidancePhase) {
      interceptor.phaseChangeTime = simulationTime
      console.log(
          `Interceptor ${index} changed phase to ${interceptor.guidancePhase} at time ${simulationTime.toFixed(2)}`,
      )
    }

    // Обновление текста фазы
    updatePhaseText(interceptor)

    // Регулярное обновление точки перехвата (каждые updateInterval секунд)
    if (simulationTime - interceptor.lastUpdateTime >= interceptor.updateInterval) {
      // Прогнозирование новой точки перехвата
      const interceptionPoint = predictInterceptionPoint(
          interceptor.mesh.position,
          interceptor.velocity,
          target.mesh.position,
          target.velocity,
          gravity,
      )

      // Сохранение предыдущей целевой точки для сравнения
      interceptor.lastTargetPos = interceptor.targetPos ? interceptor.targetPos.clone() : null

      // Сохранение новой целевой точки
      interceptor.targetPos = interceptionPoint.clone()

      // Обновление маркера точки упреждения
      if (interceptor.marker && document.getElementById("showPrediction").checked) {
        interceptor.marker.position.copy(interceptionPoint)
        interceptor.marker.visible = true
      } else if (interceptor.marker) {
        interceptor.marker.visible = false
      }

      // Обновление времени последнего обновления
      interceptor.lastUpdateTime = simulationTime
    }

    // Обновление прогнозируемой траектории (каждые predictionUpdateInterval секунд)
    if (
        interceptor.predictedLine &&
        simulationTime - interceptor.lastPredictionUpdateTime >= interceptor.predictionUpdateInterval
    ) {
      const trajectory = predictInterceptorTrajectory(interceptor, interceptor.targetPos)
      interceptor.predictedLine.geometry.setFromPoints(trajectory)
      interceptor.predictedLine.computeLineDistances() // Обновляем расстояния для пунктирной линии
      interceptor.lastPredictionUpdateTime = simulationTime
    }

    // Вычисление линии визирования (Line of Sight)
    const currentLOS = target.mesh.position.clone().sub(interceptor.mesh.position).normalize()

    // Если это первое вычисление LOS, сохраняем его
    if (!interceptor.lastLOS) {
      interceptor.lastLOS = currentLOS
    }

    // Вычисление скорости изменения LOS (угловая скорость линии визирования)
    const losRate = new THREE.Vector3().crossVectors(interceptor.lastLOS, currentLOS).length() / dt

    // Сохраняем текущий LOS для следующего кадра
    interceptor.lastLOS = currentLOS

    // Применяем разные алгоритмы наведения в зависимости от фазы
    let steerDir

    if (interceptor.guidancePhase === GUIDANCE_PHASES.BOOST) {
      // В фазе разгона просто направляем ракету вверх
      steerDir = new THREE.Vector3(0, 1, 0)
    } else if (interceptor.guidancePhase === GUIDANCE_PHASES.MIDCOURSE) {
      // В средней фазе используем комбинированный метод наведения

      // 1. Вычисляем вектор от перехватчика к точке упреждения
      const toTarget = interceptor.targetPos.clone().sub(interceptor.mesh.position)

      // 2. Вычисляем вектор от перехватчика к текущей позиции цели
      const toCurrentTarget = target.mesh.position.clone().sub(interceptor.mesh.position)

      // 3. Вычисляем относительную скорость
      const relativeVelocity = target.velocity.clone().sub(interceptor.velocity)

      // 4. Вычисляем время до перехвата
      const timeToGo = toTarget.length() / Math.max(relativeVelocity.length(), 10)

      // 5. Вычисляем вектор упреждения с учетом скорости цели
      const leadVector = target.velocity.clone().multiplyScalar(timeToGo * 0.8)

      // 6. Вычисляем точку упреждения
      const leadPoint = target.mesh.position.clone().add(leadVector)

      // 7. Направление на точку упреждения
      const aimDir = leadPoint.clone().sub(interceptor.mesh.position).normalize()

      // 8. Комбинируем направление на текущую позицию цели и на точку упреждения
      // Это ключевое изменение - теперь перехватчик будет стремиться и к текущей позиции цели,
      // и к прогнозируемой точке перехвата
      const currentTargetDir = toCurrentTarget.normalize()
      const combinedDir = currentTargetDir.clone().lerp(aimDir, 0.7).normalize()

      // 9. Усиливаем маневренность для резкого поворота с учетом агрессивности
      steerDir = steerTowards(
          interceptor.velocity.clone().normalize(),
          combinedDir,
          interceptor.maneuverability,
          dt,
          systemConstants.midcourseAggressiveness,
      )
    } else {
      // В терминальной фазе используем комбинацию прямого наведения и пропорционального наведения

      // 1. Прямое наведение на цель
      const directAimDir = target.mesh.position.clone().sub(interceptor.mesh.position).normalize()

      // 2. Пропорциональное наведение
      // Вычисляем относительную скорость
      const relativeVelocity = target.velocity.clone().sub(interceptor.velocity)

      // Вычисляем ускорение по методу пропорционального наведения
      const accelerationMagnitude = interceptor.navigationConstant * relativeVelocity.length() * losRate

      // Направление ускорения перпендикулярно LOS и вектору угловой скорости LOS
      const accelerationDir = new THREE.Vector3()
          .crossVectors(
              interceptor.lastLOS,
              new THREE.Vector3().crossVectors(interceptor.lastLOS, currentLOS).normalize(),
          )
          .normalize()

      // 3. Если ракета близко к цели, увеличиваем агрессивность наведения
      const closeRange = systemConstants.closeRange
      const aggressiveness = dist < closeRange ? 1.0 + (closeRange - dist) / closeRange : 1.0

      // 4. Применяем ускорение к текущему направлению
      const currentDir = interceptor.velocity.clone().normalize()
      const acceleration = accelerationDir.multiplyScalar(accelerationMagnitude * aggressiveness * dt)

      // 5. Новое направление с учетом ускорения
      const pnDir = currentDir.clone().add(acceleration).normalize()

      // 6. Комбинируем прямое наведение и пропорциональное наведение
      // Чем ближе к цели, тем больше вес прямого наведения
      const distFactor = Math.min(1.0, dist / systemConstants.terminalDistance)
      const combinedDir = directAimDir.clone().lerp(pnDir, distFactor).normalize()

      // 7. Применяем агрессивность терминальной фазы
      steerDir = steerTowards(
          currentDir,
          combinedDir,
          interceptor.maneuverability,
          dt,
          systemConstants.terminalAggressiveness,
      )
    }

    // Сохраняем желаемое направление
    interceptor.desiredDirection = steerDir.clone()

    // Обновляем визуализатор направления
    if (interceptor.directionHelper && systemConstants.debugMode) {
      interceptor.directionHelper.position.copy(interceptor.mesh.position)
      interceptor.directionHelper.setDirection(steerDir)
    }

    // Расчет плотности воздуха на текущей высоте
    const rho = airDensity(interceptor.mesh.position.y)

    // Расчет силы сопротивления воздуха
    const dragMagnitude = 0.5 * rho * interceptor.cd * interceptor.area * interceptor.velocity.lengthSq()
    const drag = interceptor.velocity
        .clone()
        .normalize()
        .multiplyScalar(-dragMagnitude / interceptor.mass)

    // Расчет силы тяги (если осталось время горения)
    let thrustForce = new THREE.Vector3()
    if (interceptor.burn > 0) {
      // Применяем тягу в направлении желаемого движения
      // Используем фактор влияния направления на тягу
      const thrustDir = interceptor.velocity
          .clone()
          .normalize()
          .lerp(steerDir, systemConstants.thrustDirectionFactor)
          .normalize()
      thrustForce = thrustDir.multiplyScalar(interceptor.thrust / interceptor.mass)

      // Уменьшаем оставшееся время горения
      interceptor.burn -= dt
    }

    // Суммарное ускорение: сопротивление + тяга + гравитация
    const acceleration = new THREE.Vector3()
    acceleration.add(drag)
    acceleration.add(thrustForce)
    acceleration.add(new THREE.Vector3(0, -gravity, 0))

    // Применение ускорения
    interceptor.velocity.add(acceleration.multiplyScalar(dt))

    // Корректировка вектора скорости в сторону желаемого направления
    if (interceptor.guidancePhase !== GUIDANCE_PHASES.BOOST) {
      const currentDir = interceptor.velocity.clone().normalize()
      const speed = interceptor.velocity.length()

      // Используем маневренность для ограничения скорости поворота
      // Добавляем дополнительный фактор для более агрессивного маневрирования
      let turnRate

      if (interceptor.guidancePhase === GUIDANCE_PHASES.MIDCOURSE) {
        // В средней фазе используем параметр midcourseAggressiveness
        turnRate = interceptor.maneuverability * dt * (1.0 + systemConstants.midcourseAggressiveness / 10.0)
      } else {
        // В терминальной фазе используем параметр terminalAggressiveness
        turnRate = interceptor.maneuverability * dt * (1.0 + systemConstants.terminalAggressiveness / 10.0)
      }

      // Ограничиваем максимальный поворот
      turnRate = Math.min(turnRate, 0.2)

      // Применяем более плавную интерполяцию для реалистичного поведения
      // Используем velocityAdjustmentRate для контроля скорости корректировки
      const adjustmentRate = systemConstants.velocityAdjustmentRate * (1.0 + (dist < 1000 ? (1000 - dist) / 1000 : 0))
      const adjustedDir = currentDir
          .clone()
          .lerp(steerDir, adjustmentRate * turnRate)
          .normalize()

      // Обновляем вектор скорости
      interceptor.velocity = adjustedDir.multiplyScalar(speed)
    }

    // Обновление позиции
    interceptor.mesh.position.add(interceptor.velocity.clone().multiplyScalar(dt))

    // Обновление ориентации
    updateOrientation(interceptor.mesh, interceptor.velocity)

    // Обновление траектории (с ограничением частоты обновления)
    if (simulationTime - interceptor.lastTrailUpdateTime >= interceptor.trailUpdateInterval) {
      interceptor.trail.push(interceptor.mesh.position.clone())
      if (interceptor.line) {
        interceptor.line.geometry.setFromPoints(interceptor.trail)
      }
      interceptor.lastTrailUpdateTime = simulationTime
    }

    // Получение радиуса поражения
    const killRadius = Number.parseFloat(document.getElementById("killRadius").value)

    // Проверка перехвата цели
    if (dist < killRadius) {
      // Проверяем угол между скоростью перехватчика и направлением на цель
      const toTarget = target.mesh.position.clone().sub(interceptor.mesh.position).normalize();
      const interceptorDir = interceptor.velocity.clone().normalize();
      const angle = Math.acos(Math.max(-1, Math.min(1, interceptorDir.dot(toTarget)))); // радианы
      // Если угол больше 90°, шанс поражения резко падает
      let probability = systemConstants.interceptProbability;
      // Если ракета летит строго в обратную сторону — промах
      const hitAngleRad = systemConstants.hitAngleThreshold * Math.PI / 180;
      if (angle > hitAngleRad) probability = 0;
      if (Math.random() > probability) {
        interceptor.active = false;
        interceptor.missStatus = 'miss';
        if (interceptor.phaseText) { scene.remove(interceptor.phaseText.sprite); interceptor.phaseText = null; }
        if (interceptor.directionHelper) { scene.remove(interceptor.directionHelper); interceptor.directionHelper = null; }
        if (interceptor.predictedLine) { scene.remove(interceptor.predictedLine); interceptor.predictedLine = null; }
        return;
      }
      
      // Создание эффекта взрыва
      createExplosion(target.mesh.position, 0xffaa00, 300)

      // Деактивация перехватчика
      interceptor.active = false
      interceptor.missStatus = 'hit';

      // Удаление цели
      scene.remove(target.mesh)
      if (target.line) scene.remove(target.line)
      target = null

      // Отключение кнопки запуска перехватчика
      document.getElementById("launchInterceptor").disabled = true

      // Удаление текста фазы и визуализатора направления
      if (interceptor.phaseText) {
        scene.remove(interceptor.phaseText.sprite)
        interceptor.phaseText = null
      }
      if (interceptor.directionHelper) {
        scene.remove(interceptor.directionHelper)
        interceptor.directionHelper = null
      }

      // Удаление пунктирной линии
      if (interceptor.predictedLine) {
        scene.remove(interceptor.predictedLine)
        interceptor.predictedLine = null
      }

      // Показываем финальное сообщение с задержкой
      setTimeout(() => {
        isPaused = true;
        clock.stop();
        showFinalMessage("ЦЕЛЬ ПОРАЖЕНА!", true);
      }, 1000);
    }
    // Проверка столкновения с землей
    else if (interceptor.mesh.position.y <= 0) {
      // Деактивация перехватчика
      interceptor.active = false
      interceptor.missStatus = 'ground';
      // Изменение цвета траектории
      if (interceptor.line) {
        interceptor.line.material.color.set(0xff3333)
      }

      // Создание маркера падения
      const debrisMaterial = new THREE.MeshBasicMaterial({ color: 0xff3333 })
      const debrisGeometry = new THREE.SphereGeometry(30, 16, 16)
      const debrisMesh = new THREE.Mesh(debrisGeometry, debrisMaterial)
      debrisMesh.position.copy(interceptor.mesh.position)
      debrisMesh.position.y = 1
      scene.add(debrisMesh)
      debris.push({ mesh: debrisMesh })

      // Удаление перехватчика
      const lastPosition = interceptor.mesh.position.clone();
      scene.remove(interceptor.mesh);
      if (interceptor.marker) scene.remove(interceptor.marker)

      // Удаление текста фазы и визуализатора направления
      if (interceptor.phaseText) {
        scene.remove(interceptor.phaseText.sprite)
        interceptor.phaseText = null
      }
      if (interceptor.directionHelper) {
        scene.remove(interceptor.directionHelper)
        interceptor.directionHelper = null
      }

      // Удаление пунктирной линии
      if (interceptor.predictedLine) {
        scene.remove(interceptor.predictedLine)
        interceptor.predictedLine = null
      }
      // Удаление подписи номера перехватчика
      if (interceptor.numberText && interceptor.numberText.sprite) {
        scene.remove(interceptor.numberText.sprite);
        interceptor.numberText = null;
      }
      debrisMesh.position.copy(lastPosition);
    }

    // Проверка промаха по углу и расстоянию
    const missDistance = systemConstants.missDistanceMultiplier * killRadius;
    const toTarget = target.mesh.position.clone().sub(interceptor.mesh.position);
    const distToTarget = toTarget.length();
    const interceptorDir = interceptor.velocity.clone().normalize();
    const angleDeg = Math.acos(Math.max(-1, Math.min(1, interceptorDir.dot(toTarget.normalize())))) * 180 / Math.PI;
    
    // Сохраняем значения для анализа заранее
    const targetSpeed = target.velocity.length();
    const interceptorSpeed = interceptor.velocity.length();
    
    // Функция для сохранения анализа промаха
    const saveMissAnalysis = (type) => {
        // Сохраняем текущую скорость цели
        const currentTargetSpeed = target.velocity.length();
        
        // Определяем причину промаха
        let reason = '';
        if (type === 'miss') {
            if (angleDeg > systemConstants.missAngleThreshold) {
                reason = 'Большой угол между скоростью и целью';
            } else if (distToTarget > killRadius * 1.5) {
                reason = 'Большое расстояние до цели';
            } else if (interceptorSpeed < currentTargetSpeed * 0.8) {
                reason = 'Недостаточная скорость перехватчика';
            }
        } else if (type === 'trajectory') {
            if (interceptor.minDistanceToTarget > killRadius * 1.5) {
                reason = 'Траектория не обеспечила достаточного сближения';
            } else if (interceptorSpeed < currentTargetSpeed * 0.8) {
                reason = 'Недостаточная скорость для перехвата';
            } else {
                reason = 'Неоптимальная траектория перехвата';
            }
        }
        
        interceptor.missAnalysis = {
            type: type,
            'Причина': reason,
            'Расстояние до цели': distToTarget.toFixed(2) + ' м',
            'Угол между скоростью и целью': angleDeg.toFixed(2) + '°',
            'Порог угла для промаха': systemConstants.missAngleThreshold + '°',
            'Радиус поражения': killRadius + ' м',
            'Максимальное расстояние для промаха': missDistance.toFixed(2) + ' м',
            'Скорость перехватчика': interceptorSpeed.toFixed(2) + ' м/с',
            'Скорость цели': currentTargetSpeed.toFixed(2) + ' м/с',
            'Фаза наведения': interceptor.guidancePhase,
            'Агрессивность средней фазы': systemConstants.midcourseAggressiveness,
            'Агрессивность терминальной фазы': systemConstants.terminalAggressiveness,
            'Фактор сглаживания поворотов': systemConstants.turnSmoothingFactor,
            'Минимальная скорость поворота': systemConstants.minTurnRate,
            'Максимальная скорость поворота': systemConstants.maxTurnRate,
            'Константа наведения': systemConstants.navigationConstant,
            'Фактор упреждения': systemConstants.trajectoryLeadFactor
        };
    };

    if (
      interceptor.active &&
      distToTarget < missDistance &&
      distToTarget > killRadius &&
      angleDeg > systemConstants.missAngleThreshold
    ) {
      // Сохраняем анализ перед деактивацией
      saveMissAnalysis('miss');
      
      interceptor.active = false;
      interceptor.missStatus = 'miss';
      // Сохраняем позицию до удаления mesh
      const lastPosition = interceptor.mesh.position.clone();
      
      // Изменяем цвет траектории на голубой
      if (interceptor.line) {
        interceptor.line.material.color.set(0x33ccff);
      }
      
      // Создаем голубой шар на месте промаха
      const debrisMaterial = new THREE.MeshBasicMaterial({ color: 0x33ccff });
      const debrisGeometry = new THREE.SphereGeometry(30, 16, 16);
      const debrisMesh = new THREE.Mesh(debrisGeometry, debrisMaterial);
      debrisMesh.position.copy(lastPosition);
      scene.add(debrisMesh);
      debris.push({ mesh: debrisMesh });
      
      // Удаляем визуальные элементы
      if (interceptor.marker) scene.remove(interceptor.marker);
      if (interceptor.phaseText) { scene.remove(interceptor.phaseText.sprite); interceptor.phaseText = null; }
      if (interceptor.directionHelper) { scene.remove(interceptor.directionHelper); interceptor.directionHelper = null; }
      if (interceptor.predictedLine) { scene.remove(interceptor.predictedLine); interceptor.predictedLine = null; }
      if (interceptor.numberText && interceptor.numberText.sprite) { scene.remove(interceptor.numberText.sprite); interceptor.numberText = null; }
      
      // Удаляем меш перехватчика
      scene.remove(interceptor.mesh);
      return;
    }

    // --- ПРОМАХ ПО МИНИМАЛЬНОМУ СБЛИЖЕНИЮ ---
    // Обновляем минимальное расстояние
    const currentDist = interceptor.mesh.position.distanceTo(target.mesh.position);
    if (currentDist < interceptor.minDistanceToTarget) {
        interceptor.minDistanceToTarget = currentDist;
    }
    // Если расстояние начало увеличиваться и минимальное было вне killRadius — промах
    if (
      interceptor.minDistanceToTarget > killRadius &&
      currentDist > interceptor.minDistanceToTarget + 5 && // небольшой гистерезис
      !interceptor.missStatus
    ) {
        // Сохраняем анализ перед деактивацией
        saveMissAnalysis('trajectory');
        
        interceptor.missStatus = 'trajectory';
        
        // Сохраняем позицию до деактивации
        const lastPosition = interceptor.mesh.position.clone();
        
        // Изменяем цвет траектории на голубой
        if (interceptor.line) {
            interceptor.line.material.color.set(0x33ccff);
        }
        
        // Создаем голубой шар на месте промаха
        const debrisMaterial = new THREE.MeshBasicMaterial({ color: 0x33ccff });
        const debrisGeometry = new THREE.SphereGeometry(30, 16, 16);
        const debrisMesh = new THREE.Mesh(debrisGeometry, debrisMaterial);
        debrisMesh.position.copy(lastPosition);
        scene.add(debrisMesh);
        debris.push({ mesh: debrisMesh });
        
        // Удаляем визуальные элементы
        if (interceptor.marker) scene.remove(interceptor.marker);
        if (interceptor.phaseText) { scene.remove(interceptor.phaseText.sprite); interceptor.phaseText = null; }
        if (interceptor.directionHelper) { scene.remove(interceptor.directionHelper); interceptor.directionHelper = null; }
        if (interceptor.predictedLine) { scene.remove(interceptor.predictedLine); interceptor.predictedLine = null; }
        if (interceptor.numberText && interceptor.numberText.sprite) { scene.remove(interceptor.numberText.sprite); interceptor.numberText = null; }
        
        // Деактивируем перехватчик
        interceptor.active = false;
        
        // Удаляем меш перехватчика
        scene.remove(interceptor.mesh);
    }
  })

  // Обновление счетчика активных перехватчиков
  document.getElementById("active-interceptors").textContent = interceptors.filter((i) => i.active).length

  // Обновление контролов и рендеринг сцены
  controls.update()
  renderer.render(scene, camera)

  // Обновление статистики перехватчиков
  const statsContainer = document.getElementById("interceptors-stats");
  statsContainer.innerHTML = "";
  
  interceptors.forEach((interceptor, index) => {
    let status = '';
    let color = '';
    let hasAnalysis = false;
    if (interceptor.missStatus === 'miss') {
      status = 'Промах';
      color = 'text-red-500';
      hasAnalysis = true;
    } else if (interceptor.missStatus === 'hit') {
      status = 'Попадание';
      color = 'text-green-500';
    } else if (interceptor.missStatus === 'ground') {
      status = 'Упал';
      color = 'text-red-500';
    } else if (interceptor.missStatus === 'trajectory') {
      status = 'Траектория';
      color = 'text-orange-400';
      hasAnalysis = true;
    } else if (interceptor.active) {
      status = Math.round(interceptor.velocity.length()) + ' м/с';
      color = 'text-secondary';
    } else {
      return;
    }
    const statDiv = document.createElement("div");
    statDiv.className = "flex justify-between items-center";
    statDiv.innerHTML = `
      <span>Перехватчик #${index + 1}:</span>
      <div class="flex items-center gap-2">
        <span class="font-bold ${color}">${status}</span>
        ${hasAnalysis ? '<span class="cursor-help text-yellow-400 hover:text-yellow-300" data-interceptor-index="' + index + '">!</span>' : ''}
      </div>
    `;
    statsContainer.appendChild(statDiv);
  });

  // Удаляем старые обработчики событий
  document.querySelectorAll('[data-interceptor-index]').forEach(element => {
    const newElement = element.cloneNode(true);
    element.parentNode.replaceChild(newElement, element);
  });

  // Добавляем новые обработчики событий
  document.querySelectorAll('[data-interceptor-index]').forEach(element => {
    const index = parseInt(element.getAttribute('data-interceptor-index'));
    const interceptor = interceptors[index];
    
    if (interceptor && interceptor.missAnalysis) {
      let analysisDiv = null;
      let mouseMoveHandler = null;

      element.addEventListener('mouseenter', () => {
        // Удаляем предыдущий анализ, если он есть
        const existingAnalysis = document.querySelector('.miss-analysis-panel');
        if (existingAnalysis) {
          existingAnalysis.remove();
        }

        analysisDiv = document.createElement('div');
        analysisDiv.className = 'miss-analysis-panel bis-panel mt-2 p-4 text-sm';
        analysisDiv.style.cssText = `
          position: fixed;
          background: #181818;
          border: 2px solid #ffe066;
          color: #ffe066;
          border-radius: 0;
          box-shadow: none;
          width: 300px;
          z-index: 1000;
          pointer-events: none;
        `;
        
        // Форматируем анализ
        const analysis = interceptor.missAnalysis;
        let html = '<div class="space-y-2">';
        
        // Определяем ожидаемые значения для разных типов промахов
        const expectedValues = {
          miss: {
            'Угол между скоростью и целью': '≤ ' + systemConstants.missAngleThreshold + '°',
            'Расстояние до цели': '≤ ' + (killRadius * 1.5).toFixed(2) + ' м',
            'Скорость перехватчика': '≥ ' + (target?.velocity.length() * 0.8 || 0).toFixed(2) + ' м/с',
            'Агрессивность средней фазы': '≥ 15.0',
            'Агрессивность терминальной фазы': '≥ 30.0',
            'Фактор сглаживания поворотов': '≤ 0.5',
            'Константа наведения': '≥ 20.0'
          },
          trajectory: {
            'Минимальное расстояние до цели': '≤ ' + killRadius + ' м',
            'Скорость перехватчика': '≥ ' + (target?.velocity.length() * 0.8 || 0).toFixed(2) + ' м/с',
            'Агрессивность средней фазы': '≥ 15.0',
            'Агрессивность терминальной фазы': '≥ 30.0',
            'Фактор сглаживания поворотов': '≤ 0.5',
            'Константа наведения': '≥ 20.0'
          }
        };

        // Функция для проверки отклонения параметра
        const isDeviation = (key, value) => {
          const expected = expectedValues[analysis.type]?.[key];
          if (!expected) return false;

          // Извлекаем числовые значения
          const currentValue = parseFloat(value);
          const expectedValue = parseFloat(expected.replace(/[^0-9.-]+/g, ''));
          
          // Проверяем условие в зависимости от оператора
          if (expected.includes('≤')) {
            return currentValue > expectedValue;
          } else if (expected.includes('≥')) {
            return currentValue < expectedValue;
          }
          return false;
        };

        // Сначала выводим причину промаха
        html += `<div class="mb-2 pb-2 border-b border-yellow-400">
          <span class="font-bold">Причина промаха:</span>
          <span class="text-yellow-400">${analysis['Причина']}</span>
        </div>`;

        for (const [key, value] of Object.entries(analysis)) {
          if (key !== 'type' && key !== 'Причина') {
            const isDeviated = isDeviation(key, value);
            const expected = expectedValues[analysis.type]?.[key] || '';
            
            html += `<div class="flex justify-between">
              <span class="text-gray-400">${key}:</span>
              <div class="flex items-center gap-2">
                <span class="${isDeviated ? 'text-red-500' : ''}">${value}</span>
                ${expected ? `<span class="text-gray-500 text-xs">(${expected})</span>` : ''}
              </div>
            </div>`;
          }
        }
        html += '</div>';
        analysisDiv.innerHTML = html;
        
        // Добавляем на страницу
        document.body.appendChild(analysisDiv);

        // Позиционируем анализ
        const updatePosition = () => {
          const rect = element.getBoundingClientRect();
          const analysisRect = analysisDiv.getBoundingClientRect();
          
          // Позиционируем слева от курсора
          let left = rect.left - analysisRect.width - 10;
          let top = rect.top;
          
          // Проверяем, не выходит ли за левый край экрана
          if (left < 10) {
            left = 10;
          }
          
          // Проверяем, не выходит ли за правый край экрана
          if (left + analysisRect.width > window.innerWidth - 10) {
            left = window.innerWidth - analysisRect.width - 10;
          }
          
          // Проверяем, не выходит ли за нижний край экрана
          if (top + analysisRect.height > window.innerHeight - 10) {
            top = window.innerHeight - analysisRect.height - 10;
          }
          
          // Проверяем, не выходит ли за верхний край экрана
          if (top < 10) {
            top = 10;
          }
          
          analysisDiv.style.left = left + 'px';
          analysisDiv.style.top = top + 'px';
        };

        // Обновляем позицию при движении мыши
        mouseMoveHandler = (e) => {
          // Проверяем, находится ли курсор над элементом
          const rect = element.getBoundingClientRect();
          if (e.clientX < rect.left || e.clientX > rect.right || 
              e.clientY < rect.top || e.clientY > rect.bottom) {
            // Если курсор вышел за пределы элемента, удаляем панель
            if (analysisDiv) {
              analysisDiv.remove();
              analysisDiv = null;
            }
            if (mouseMoveHandler) {
              document.removeEventListener('mousemove', mouseMoveHandler);
              mouseMoveHandler = null;
            }
          } else {
            updatePosition();
          }
        };

        document.addEventListener('mousemove', mouseMoveHandler);
        updatePosition();
      });
      
      element.addEventListener('mouseleave', () => {
        if (analysisDiv) {
          analysisDiv.remove();
          analysisDiv = null;
        }
        if (mouseMoveHandler) {
          document.removeEventListener('mousemove', mouseMoveHandler);
          mouseMoveHandler = null;
        }
      });
    }
  });

  // Обновление номеров перехватчиков
  interceptors.forEach((interceptor, index) => {
    if (!interceptor.active || !interceptor.numberText) return;
    
    interceptor.numberText.sprite.position.copy(interceptor.mesh.position);
    interceptor.numberText.sprite.position.y += 150;
  });

  // Проверка проигрыша
  const allLaunched = interceptors.length >= MAX_INTERCEPTORS;
  const allInactive = interceptors.filter(i => i.missStatus === 'miss' || i.missStatus === 'ground' || i.missStatus === 'trajectory').length >= MAX_INTERCEPTORS;
  if (allLaunched && allInactive && target) {
    // Показываем финальное сообщение с задержкой
    setTimeout(() => {
      isPaused = true;
      clock.stop();
      showFinalMessage("ПРОИГРЫШ: Цель достигла земли, все перехватчики промахнулись!", false);
    }, 1000);
  }

  // Обновление прогнозируемой траектории
  interceptors.forEach((interceptor, index) => {
    if (!interceptor.active || !target) return

    // ... existing code ...

    // Обновление прогнозируемой траектории
    if (interceptor.predictedLine && document.getElementById("showTrajectories").checked) {
        if (simulationTime - interceptor.lastPredictionUpdateTime >= interceptor.predictionUpdateInterval) {
            const trajectory = predictInterceptorTrajectory(interceptor, interceptor.targetPos)
            interceptor.predictedLine.geometry.setFromPoints(trajectory)
            interceptor.predictedLine.computeLineDistances()
            interceptor.predictedLine.visible = true
            interceptor.lastPredictionUpdateTime = simulationTime
        }
    } else if (interceptor.predictedLine) {
        interceptor.predictedLine.visible = false
    }

    // ... existing code ...
  })
}

// Создание эффекта взрыва
function createExplosion(position, color, size) {
  // Создание частиц взрыва
  const particleCount = 50
  const particles = []

  for (let i = 0; i < particleCount; i++) {
    const particleGeometry = new THREE.SphereGeometry(Math.random() * 20 + 5, 8, 8)
    const particleMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
    })
    const particle = new THREE.Mesh(particleGeometry, particleMaterial)

    // Случайная позиция вокруг центра взрыва
    particle.position.copy(position)

    // Случайная скорость
    particle.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
    )

    // Время жизни частицы
    particle.lifetime = Math.random() * 2 + 1
    particle.age = 0

    scene.add(particle)
    particles.push(particle)
  }

  // Анимация частиц
  function animateParticles() {
    let allDead = true

    particles.forEach((particle) => {
      if (particle.age < particle.lifetime) {
        allDead = false

        // Обновление позиции
        particle.position.add(particle.velocity.clone().multiplyScalar(0.016))

        // Уменьшение скорости
        particle.velocity.multiplyScalar(0.95)

        // Уменьшение размера и прозрачности
        const scale = 1 - particle.age / particle.lifetime
        particle.scale.set(scale, scale, scale)
        particle.material.opacity = scale

        // Увеличение возраста
        particle.age += 0.016
      } else if (particle.parent) {
        // Удаление мертвых частиц
        scene.remove(particle)
      }
    })

    if (!allDead) {
      requestAnimationFrame(animateParticles)
    }
  }

  animateParticles()
}

// Отображение сообщения
function showMessage(text, isSuccess = true) {
    const template = document.getElementById('message-template');
    const message = template.content.cloneNode(true);
    const messageElement = message.querySelector('div');
    messageElement.textContent = text;
    messageElement.classList.remove('glass-panel', 'rounded-xl', 'shadow-2xl');
    messageElement.classList.add('bis-panel');
    messageElement.style.background = '#181818';
    messageElement.style.border = '2px solid #ffe066';
    messageElement.style.color = '#ffe066';
    messageElement.style.borderRadius = '0';
    messageElement.style.boxShadow = 'none';
    messageElement.classList.add(isSuccess ? 'text-green-400' : 'text-red-400');
    document.body.appendChild(message);
    setTimeout(() => messageElement.remove(), 3000);
}

// Инициализация при загрузке страницы
window.onload = () => {
    // Инициализируем системные константы из выбранного типа перехвата
    initializeSystemConstants();
    
    // Проверяем наличие необходимых скриптов
    if (typeof THREE === 'undefined') {
        console.error("Three.js не загружен")
        showMessage("Ошибка: Three.js не загружен", "fail")
        return
    }

    // Проверяем наличие OrbitControls
    if (typeof THREE.OrbitControls === 'undefined') {
        console.error("OrbitControls не загружен")
        showMessage("Ошибка: OrbitControls не загружен", "fail")
        return
    }

    // Добавляем обработчики для тултипов
    const tooltips = {
        'targetSpeed': 'Начальная скорость баллистической ракеты при запуске (в метрах в секунду)',
        'targetAngle': 'Угол запуска ракеты относительно горизонта (в градусах)',
        'targetMass': 'Масса баллистической ракеты (в килограммах)',
        'targetCd': 'Коэффициент аэродинамического сопротивления ракеты',
        'targetArea': 'Площадь поперечного сечения ракеты (в квадратных метрах)',
        'mass': 'Масса перехватчика (в килограммах)',
        'cd': 'Коэффициент аэродинамического сопротивления перехватчика',
        'area': 'Площадь поперечного сечения перехватчика (в квадратных метрах)',
        'thrust': 'Сила тяги двигателя перехватчика (в ньютонах)',
        'burn': 'Время работы двигателя перехватчика (в секундах)',
        'v0': 'Начальная скорость перехватчика при запуске (в метрах в секунду)',
        'killRadius': 'Радиус поражения боевой части перехватчика (в метрах)',
        'maxCorrections': 'Максимальное количество корректировок траектории перехватчика',
        'maneuverability': 'Максимальная угловая скорость поворота перехватчика (в градусах в секунду)',
        'atmosphereModel': 'Модель атмосферы для расчета сопротивления воздуха',
        'atmosphereHeight': 'Масштаб высоты атмосферы (в метрах)',
        'rho0': 'Плотность воздуха на уровне моря (в килограммах на кубический метр)',
        'gravity': 'Ускорение свободного падения (в метрах на секунду в квадрате)'
    };

    // Создаем один тултип для всех параметров
    const tooltipTemplate = document.getElementById('tooltip-template');
    if (tooltipTemplate) {
        const tooltip = tooltipTemplate.content.cloneNode(true);
        const tooltipElement = tooltip.querySelector('div');
        if (tooltipElement) {
            document.body.appendChild(tooltip);

            // Добавляем обработчики для всех кнопок с вопросами
            document.querySelectorAll('button.cursor-help').forEach(button => {
                const label = button.closest('label');
                if (label) {
                    const input = label.querySelector('input, select');
                    if (input) {
                        const paramId = input.id;
                        const description = tooltips[paramId];

                        button.addEventListener('mouseenter', () => {
                            tooltipElement.textContent = description;
                            tooltipElement.classList.remove('hidden');
                            
                            // Позиционируем тултип по центру вверху экрана
                            tooltipElement.style.left = '50%';
                            tooltipElement.style.top = '20px';
                            tooltipElement.style.transform = 'translateX(-50%)';
                        });

                        button.addEventListener('mouseleave', () => {
                            tooltipElement.classList.add('hidden');
                        });
                    }
                }
            });
        }
    }

    // Инициализируем сцену
    init();

    // Обработчики для переключателей
    const showPrediction = document.getElementById("showPrediction");
    if (showPrediction) {
        showPrediction.addEventListener("change", function() {
            interceptors.forEach(interceptor => {
                if (interceptor.marker) {
                    interceptor.marker.visible = this.checked;
                }
            });
        });
    }

    const showTrajectories = document.getElementById("showTrajectories");
    if (showTrajectories) {
        showTrajectories.addEventListener("change", function() {
            interceptors.forEach(interceptor => {
                if (interceptor.line) {
                    interceptor.line.visible = this.checked;
                }
                if (interceptor.predictedLine) {
                    interceptor.predictedLine.visible = this.checked;
                    if (this.checked) {
                        // Обновляем прогноз при включении отображения
                        const trajectory = predictInterceptorTrajectory(interceptor, interceptor.targetPos)
                        interceptor.predictedLine.geometry.setFromPoints(trajectory)
                        interceptor.predictedLine.computeLineDistances()
                    }
                }
            });
            if (target && target.line) {
                target.line.visible = this.checked;
            }
        });
    }

    const showPhases = document.getElementById("showPhases");
    if (showPhases) {
        showPhases.addEventListener("change", function() {
            interceptors.forEach(interceptor => {
                if (interceptor.phaseText) {
                    interceptor.phaseText.sprite.visible = this.checked;
                }
            });
        });
    }

    // Добавляем обработчик для кнопки паузы
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            isPaused = !isPaused;
            if (isPaused) {
                clock.stop();
                pauseBtn.textContent = '▶ Продолжить';
                pauseBtn.classList.remove('bg-yellow-600', 'hover:bg-yellow-700');
                pauseBtn.classList.add('bg-green-600', 'hover:bg-green-700');
            } else {
                clock.start();
                pauseBtn.textContent = '⏸ Пауза';
                pauseBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
                pauseBtn.classList.add('bg-yellow-600', 'hover:bg-yellow-700');
            }
        });
    }

    // Добавляем обработчик для выбора максимального количества перехватчиков
    const maxInterceptorsSelect = document.getElementById('maxInterceptors');
    if (maxInterceptorsSelect) {
        maxInterceptorsSelect.addEventListener('change', () => {
            MAX_INTERCEPTORS = parseInt(maxInterceptorsSelect.value);
            updateInterceptorButton();
        });
    }

    // Обработчик для interceptProbability
    const interceptProbInput = document.getElementById('constant-interceptProbability');
    if (interceptProbInput) {
        interceptProbInput.addEventListener('input', function() {
            systemConstants.interceptProbability = parseFloat(this.value);
        });
    }
}

// Функция обновления состояния кнопки запуска перехватчика
function updateInterceptorButton() {
    const launchBtn = document.getElementById('launchInterceptor');
    if (launchBtn) {
        const activeCount = interceptors.filter(i => i.active).length;
        launchBtn.disabled = activeCount >= MAX_INTERCEPTORS;
    }
}

// Добавим функцию для обновления текста фазы
function updatePhaseText(interceptor) {
    if (!interceptor.phaseText || !document.getElementById("showPhases").checked) return;

    const phase = interceptor.guidancePhase.toUpperCase();
    const context = interceptor.phaseText.context;
    const canvas = interceptor.phaseText.canvas;
    const texture = interceptor.phaseText.texture;

    // Очищаем canvas
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Устанавливаем цвет текста в зависимости от фазы
    switch (interceptor.guidancePhase) {
        case GUIDANCE_PHASES.BOOST:
            context.fillStyle = "#ff3333"; // Красный для фазы разгона
            break;
        case GUIDANCE_PHASES.MIDCOURSE:
            context.fillStyle = "#ffaa00"; // Оранжевый для средней фазы
            break;
        case GUIDANCE_PHASES.TERMINAL:
            context.fillStyle = "#33ff33"; // Зеленый для терминальной фазы
            break;
        default:
            context.fillStyle = "#ffffff"; // Белый по умолчанию
    }

    // Рисуем текст
    context.font = "bold 24px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(phase, canvas.width / 2, canvas.height / 2);

    // Обновляем текстуру
    texture.needsUpdate = true;

    // Позиционируем текст над перехватчиком
    interceptor.phaseText.sprite.position.copy(interceptor.mesh.position);
    interceptor.phaseText.sprite.position.y += 100;
}

// === Функция для оценки шанса попадания ===
function calculateHitChance() {
    if (!target || interceptors.length === 0) return null;
    
    // Берём самого "перспективного" активного перехватчика (ближайшего к цели)
    const activeInterceptors = interceptors.filter(i => i.active);
    if (activeInterceptors.length === 0) return null;
    
    let best = activeInterceptors[0];
    let minDist = best.mesh.position.distanceTo(target.mesh.position);
    for (const i of activeInterceptors) {
        const d = i.mesh.position.distanceTo(target.mesh.position);
        if (d < minDist) {
            minDist = d;
            best = i;
        }
    }

    // Физические параметры
    const dist = minDist;
    const killRadius = Number.parseFloat(document.getElementById("killRadius").value);
    const interceptorDir = best.velocity.clone().normalize();
    const toTarget = target.mesh.position.clone().sub(best.mesh.position).normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, interceptorDir.dot(toTarget)))); // радианы
    const angleDeg = angle * 180 / Math.PI;

    // Базовая вероятность из системных констант
    let probability = systemConstants.interceptProbability;

    // Если угол больше hitAngleThreshold — шанс 0
    const hitAngleRad = systemConstants.hitAngleThreshold * Math.PI / 180;
    if (angle > hitAngleRad) probability = 0;

    // Расчет относительной скорости
    const relativeVelocity = target.velocity.clone().sub(best.velocity);
    const closingSpeed = relativeVelocity.dot(toTarget);
    
    // Расчет времени до перехвата (приблизительно)
    const timeToIntercept = dist / Math.max(closingSpeed, 1);
    
    // Фактор расстояния (более плавный)
    const distanceFactor = Math.max(0, Math.min(1, 
        1 - (dist / (systemConstants.terminalDistance * 2))));
    
    // Фактор угла (более плавный)
    const angleFactor = Math.max(0, Math.min(1, 
        1 - (angleDeg / systemConstants.hitAngleThreshold)));
    
    // Фактор скорости сближения
    const speedFactor = Math.max(0, Math.min(1, 
        (closingSpeed - systemConstants.minClosingSpeed) / 
        (systemConstants.maxClosingSpeed - systemConstants.minClosingSpeed)));
    
    // Фактор времени до перехвата
    const timeFactor = Math.max(0, Math.min(1, 
        1 - (timeToIntercept / 30)));
    
    // Комбинируем все факторы с весами из системных констант
    probability *= (
        distanceFactor * systemConstants.distanceWeight + 
        angleFactor * systemConstants.angleWeight + 
        speedFactor * systemConstants.speedWeight
    );
    
    // Если очень близко и угол хороший — шанс максимальный
    if (dist < killRadius * 1.2 && angleDeg < 30) {
        probability = Math.max(probability, 0.95);
    }
    
    // Если слишком далеко — шанс минимальный
    if (dist > killRadius * 20) {
        probability = Math.min(probability, 0.1);
    }
    
    // Ограничим диапазон
    probability = Math.max(0, Math.min(1, probability));
    
    return probability;
}

// В анимации обновляем шанс попадания
function updateHitChanceUI() {
    const el = document.getElementById('hit-chance');
    if (!el) return;
    const prob = calculateHitChance();
    if (prob === null) {
        el.textContent = '-';
        el.className = 'font-bold';
        return;
    }
    const percent = Math.round(prob * 100);
    el.textContent = percent + '%';
    if (percent <= 20) {
        el.className = 'font-bold text-red-500';
    } else if (percent <= 80) {
        el.className = 'font-bold text-yellow-400';
    } else {
        el.className = 'font-bold text-green-500';
    }
}

// Добавляем новую функцию для обработки тултипов анализа промаха
function setupMissAnalysisTooltips() {
  // Удаляем старые обработчики событий
  document.querySelectorAll('[data-interceptor-index]').forEach(element => {
    const newElement = element.cloneNode(true);
    element.parentNode.replaceChild(newElement, element);
  });

  // Добавляем новые обработчики событий
  document.querySelectorAll('[data-interceptor-index]').forEach(element => {
    const index = parseInt(element.getAttribute('data-interceptor-index'));
    const interceptor = interceptors[index];
    
    if (interceptor && interceptor.missAnalysis) {
      let analysisDiv = null;
      let mouseMoveHandler = null;

      element.addEventListener('mouseenter', () => {
        // Удаляем предыдущий анализ, если он есть
        const existingAnalysis = document.querySelector('.miss-analysis-panel');
        if (existingAnalysis) {
          existingAnalysis.remove();
        }

        analysisDiv = document.createElement('div');
        analysisDiv.className = 'miss-analysis-panel bis-panel mt-2 p-4 text-sm';
        analysisDiv.style.cssText = `
          position: fixed;
          background: #181818;
          border: 2px solid #ffe066;
          color: #ffe066;
          border-radius: 0;
          box-shadow: none;
          width: 300px;
          z-index: 1000;
          pointer-events: none;
        `;
        
        // Форматируем анализ
        const analysis = interceptor.missAnalysis;
        let html = '<div class="space-y-2">';
        
        // Определяем ожидаемые значения для разных типов промахов
        const expectedValues = {
          miss: {
            'Угол между скоростью и целью': '≤ ' + systemConstants.missAngleThreshold + '°',
            'Расстояние до цели': '≤ ' + (killRadius * 1.5).toFixed(2) + ' м',
            'Скорость перехватчика': '≥ ' + (target?.velocity.length() * 0.8 || 0).toFixed(2) + ' м/с',
            'Агрессивность средней фазы': '≥ 15.0',
            'Агрессивность терминальной фазы': '≥ 30.0',
            'Фактор сглаживания поворотов': '≤ 0.5',
            'Константа наведения': '≥ 20.0'
          },
          trajectory: {
            'Минимальное расстояние до цели': '≤ ' + killRadius + ' м',
            'Скорость перехватчика': '≥ ' + (target?.velocity.length() * 0.8 || 0).toFixed(2) + ' м/с',
            'Агрессивность средней фазы': '≥ 15.0',
            'Агрессивность терминальной фазы': '≥ 30.0',
            'Фактор сглаживания поворотов': '≤ 0.5',
            'Константа наведения': '≥ 20.0'
          }
        };

        // Функция для проверки отклонения параметра
        const isDeviation = (key, value) => {
          const expected = expectedValues[analysis.type]?.[key];
          if (!expected) return false;

          // Извлекаем числовые значения
          const currentValue = parseFloat(value);
          const expectedValue = parseFloat(expected.replace(/[^0-9.-]+/g, ''));
          
          // Проверяем условие в зависимости от оператора
          if (expected.includes('≤')) {
            return currentValue > expectedValue;
          } else if (expected.includes('≥')) {
            return currentValue < expectedValue;
          }
          return false;
        };

        // Сначала выводим причину промаха
        html += `<div class="mb-2 pb-2 border-b border-yellow-400">
          <span class="font-bold">Причина промаха:</span>
          <span class="text-yellow-400">${analysis['Причина']}</span>
        </div>`;

        for (const [key, value] of Object.entries(analysis)) {
          if (key !== 'type' && key !== 'Причина') {
            const isDeviated = isDeviation(key, value);
            const expected = expectedValues[analysis.type]?.[key] || '';
            
            html += `<div class="flex justify-between">
              <span class="text-gray-400">${key}:</span>
              <div class="flex items-center gap-2">
                <span class="${isDeviated ? 'text-red-500' : ''}">${value}</span>
                ${expected ? `<span class="text-gray-500 text-xs">(${expected})</span>` : ''}
              </div>
            </div>`;
          }
        }
        html += '</div>';
        analysisDiv.innerHTML = html;
        
        // Добавляем на страницу
        document.body.appendChild(analysisDiv);

        // Позиционируем анализ
        const updatePosition = () => {
          const rect = element.getBoundingClientRect();
          const analysisRect = analysisDiv.getBoundingClientRect();
          
          // Позиционируем слева от курсора
          let left = rect.left - analysisRect.width - 10;
          let top = rect.top;
          
          // Проверяем, не выходит ли за левый край экрана
          if (left < 10) {
            left = 10;
          }
          
          // Проверяем, не выходит ли за правый край экрана
          if (left + analysisRect.width > window.innerWidth - 10) {
            left = window.innerWidth - analysisRect.width - 10;
          }
          
          // Проверяем, не выходит ли за нижний край экрана
          if (top + analysisRect.height > window.innerHeight - 10) {
            top = window.innerHeight - analysisRect.height - 10;
          }
          
          // Проверяем, не выходит ли за верхний край экрана
          if (top < 10) {
            top = 10;
          }
          
          analysisDiv.style.left = left + 'px';
          analysisDiv.style.top = top + 'px';
        };

        // Обновляем позицию при движении мыши
        mouseMoveHandler = (e) => {
          // Проверяем, находится ли курсор над элементом
          const rect = element.getBoundingClientRect();
          if (e.clientX < rect.left || e.clientX > rect.right || 
              e.clientY < rect.top || e.clientY > rect.bottom) {
            // Если курсор вышел за пределы элемента, удаляем панель
            if (analysisDiv) {
              analysisDiv.remove();
              analysisDiv = null;
            }
            if (mouseMoveHandler) {
              document.removeEventListener('mousemove', mouseMoveHandler);
              mouseMoveHandler = null;
            }
          } else {
            updatePosition();
          }
        };

        document.addEventListener('mousemove', mouseMoveHandler);
        updatePosition();
      });
      
      element.addEventListener('mouseleave', () => {
        if (analysisDiv) {
          analysisDiv.remove();
          analysisDiv = null;
        }
        if (mouseMoveHandler) {
          document.removeEventListener('mousemove', mouseMoveHandler);
          mouseMoveHandler = null;
        }
      });
    }
  });
}

// Модифицируем функцию showFinalMessage
function showFinalMessage(text, isSuccess = true) {
    // Удаляем предыдущее сообщение, если оно есть
    const existingMessage = document.querySelector('.final-message');
    if (existingMessage) {
        existingMessage.remove();
    }

    // Создаем контейнер для сообщения
    const messageContainer = document.createElement('div');
    messageContainer.className = 'final-message';
    messageContainer.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 9999;
        background: #181818;
        border: 2px solid #ffe066;
        color: #ffe066;
        padding: 1.5rem;
        text-align: center;
        min-width: 250px;
        box-shadow: 0 0 20px rgba(0,0,0,0.5);
    `;

    // Создаем основной текст
    const mainText = document.createElement('div');
    mainText.style.cssText = `
        font-size: 20px;
        font-weight: bold;
        margin-bottom: 0.5rem;
        color: ${isSuccess ? '#4ade80' : '#ef4444'};
    `;
    mainText.textContent = text;

    // Создаем текст инструкции
    const instructionText = document.createElement('div');
    instructionText.style.cssText = `
        font-size: 16px;
        color: #ffe066;
    `;
    instructionText.textContent = 'Нажмите "Сброс" чтобы начать заново';

    // Добавляем тексты в контейнер
    messageContainer.appendChild(mainText);
    messageContainer.appendChild(instructionText);

    // Добавляем контейнер на страницу
    document.body.appendChild(messageContainer);

    // Устанавливаем обработчики для анализа промаха после остановки симуляции
    setupMissAnalysisTooltips();
}
