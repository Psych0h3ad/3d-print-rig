// Pure strings and language selection; safe to import without a browser.
export const supportedLanguages = Object.freeze(['en', 'ja', 'es', 'ko', 'ru']);
export const languageNames = Object.freeze({en: 'English', ja: '日本語', es: 'Español', ko: '한국어', ru: 'Русский'});
export const languageStorageKey = '3d-print-rig-language';

export function normalizeLanguage(value) {
  if (typeof value !== 'string') return undefined;
  const base = value.trim().toLowerCase().split('-')[0];
  return supportedLanguages.includes(base) ? base : undefined;
}
export function chooseLanguage({query, stored} = {}) {
  return normalizeLanguage(query) || normalizeLanguage(stored) || 'en';
}
export function languageURL(href, language) {
  const url = new URL(href), value = normalizeLanguage(language);
  if (value) url.searchParams.set('lang', value);
  return url.href;
}
export function resolveLayoutLanguage({href, stored} = {}) {
  let query;
  try { query = new URL(href).searchParams.get('lang'); } catch {}
  return chooseLanguage({query, stored});
}

// Each row is [id, English, Japanese, Spanish, Korean, Russian].
// Names and dimensions supplied by the catalog are values, never translated IDs.
const rows = [
  ['nav.layout', 'Layout', 'レイアウト', 'Distribución', '배치', 'Планировка'],
  ['nav.machines', 'Machines', '機種一覧', 'Impresoras', '프린터 목록', 'Принтеры'],
  ['nav.printer', 'Printer', 'プリンター', 'Impresora', '프린터', 'Принтер'],
  ['nav.toolhead', 'Toolhead', 'ツールヘッド', 'Cabezal', '툴헤드', 'Печатающая головка'],
  ['nav.gantry', 'Gantry', 'ガントリー', 'Pórtico', '갠트리', 'Портал'],
  ['nav.workspace', 'Workspace', 'ワークスペース', 'Espacio de trabajo', '작업 공간', 'Рабочая область'],
  ['common.language', 'Language', '言語', 'Idioma', '언어', 'Язык'],
  ['common.name', 'Name', '名前', 'Nombre', '이름', 'Название'],
  ['common.add', 'Add', '追加', 'Añadir', '추가', 'Добавить'],
  ['common.apply', 'Apply', '適用', 'Aplicar', '적용', 'Применить'],
  ['common.cancel', 'Cancel', 'キャンセル', 'Cancelar', '취소', 'Отмена'],
  ['common.close', 'Close', '閉じる', 'Cerrar', '닫기', 'Закрыть'],
  ['common.remove', 'Remove', '削除', 'Eliminar', '삭제', 'Удалить'],
  ['common.duplicate', 'Duplicate', '複製', 'Duplicar', '복제', 'Дублировать'],
  ['common.reset', 'Reset', 'リセット', 'Restablecer', '초기화', 'Сбросить'],
  ['common.retry', 'Try again', '再試行', 'Volver a intentar', '다시 시도', 'Повторить'],
  ['common.width', 'Width', '幅', 'Ancho', '너비', 'Ширина'],
  ['common.depth', 'Depth', '奥行き', 'Fondo', '깊이', 'Глубина'],
  ['common.height', 'Height', '高さ', 'Alto', '높이', 'Высота'],
  ['common.thickness', 'Thickness', '厚み', 'Grosor', '두께', 'Толщина'],
  ['common.mm', 'mm', 'mm', 'mm', 'mm', 'мм'],
  ['common.degrees', '°', '°', '°', '°', '°'],
  ['common.loading', 'Loading…', '読み込み中…', 'Cargando…', '불러오는 중…', 'Загрузка…'],
  ['common.saved', 'Saved', '保存しました', 'Guardado', '저장됨', 'Сохранено'],
  ['common.error', 'Something went wrong. Try again.', '処理できませんでした。再試行してください。', 'Se ha producido un error. Vuelve a intentarlo.', '처리하지 못했습니다. 다시 시도해 주세요.', 'Произошла ошибка. Повторите попытку.'],
  ['layout.title', 'Layout planner', 'レイアウトプランナー', 'Planificador de distribución', '공간 배치 플래너', 'Планировщик пространства'],
  ['layout.page_title', 'Layout planner · 3D Print Rig', 'レイアウトプランナー · 3D Print Rig', 'Planificador de distribución · 3D Print Rig', '공간 배치 플래너 · 3D Print Rig', 'Планировщик пространства · 3D Print Rig'],
  ['layout.description', 'Plan a room, desk or shelf for your 3D printers.', '3Dプリンターを置く部屋・机・棚のレイアウトを考えられます。', 'Planifica una habitación, una mesa o una estantería para tus impresoras 3D.', '3D 프린터를 놓을 방, 책상, 선반을 배치해 보세요.', 'Спланируйте размещение 3D-принтеров в комнате, на столе или стеллаже.'],
  ['layout.skip', 'Skip to layout', 'レイアウトへスキップ', 'Ir a la distribución', '배치 화면으로 건너뛰기', 'Перейти к планировке'],
  ['layout.canvas', 'Room layout', '部屋のレイアウト', 'Distribución de la habitación', '방 배치', 'Планировка комнаты'],
  ['layout.controls', 'Layout settings', 'レイアウトの設定', 'Ajustes de distribución', '배치 설정', 'Настройки планировки'],
  ['layout.items', 'Items', '配置したもの', 'Elementos', '배치된 항목', 'Объекты'],
  ['layout.empty', 'Add a desk, shelf or printer to get started.', '机・棚・プリンターを追加して始めましょう。', 'Añade una mesa, una estantería o una impresora para empezar.', '책상, 선반 또는 프린터를 추가해 시작하세요.', 'Добавьте стол, стеллаж или принтер.'],
  ['layout.instructions', 'Drag to move. Select an item to change its size or position.', 'ドラッグして移動。選ぶとサイズや位置を変更できます。', 'Arrastra para mover. Selecciona un elemento para cambiar su tamaño o posición.', '드래그해 이동하세요. 항목을 선택하면 크기나 위치를 바꿀 수 있습니다.', 'Перетаскивайте объекты. Выберите объект, чтобы изменить размер или положение.'],
  ['layout.keyboard_help', 'Use the position fields to place items precisely.', '位置の入力欄で正確に配置できます。', 'Usa los campos de posición para colocar los elementos con precisión.', '위치 입력란에서 항목을 정확하게 배치할 수 있습니다.', 'Для точного размещения используйте поля положения.'],
  ['layout.room', 'Room', '部屋', 'Habitación', '방', 'Комната'],
  ['layout.room_shape', 'Room shape', '部屋の形', 'Forma de la habitación', '방 모양', 'Форма комнаты'],
  ['layout.rectangle', 'Rectangle', '長方形', 'Rectángulo', '직사각형', 'Прямоугольник'],
  ['layout.l_shape', 'L shape', 'L字形', 'Forma de L', 'L자형', 'Г-образная'],
  ['layout.custom_shape', 'Custom shape', '自由な形', 'Forma personalizada', '직접 그리기', 'Своя форма'],
  ['layout.cut_width', 'Inset width', 'くぼみの幅', 'Ancho del entrante', '들어간 부분 너비', 'Ширина выреза'],
  ['layout.cut_depth', 'Inset depth', 'くぼみの奥行き', 'Fondo del entrante', '들어간 부분 깊이', 'Глубина выреза'],
  ['layout.wall_height', 'Wall height', '壁の高さ', 'Altura de las paredes', '벽 높이', 'Высота стен'],
  ['layout.room_points', 'Room corners', '部屋の角', 'Esquinas de la habitación', '방 모서리', 'Углы комнаты'],
  ['layout.point', 'Corner {number}', '角 {number}', 'Esquina {number}', '모서리 {number}', 'Угол {number}'],
  ['layout.add_point', 'Add a corner', '角を追加', 'Añadir esquina', '모서리 추가', 'Добавить угол'],
  ['layout.remove_point', 'Remove corner {number}', '角 {number} を削除', 'Eliminar esquina {number}', '모서리 {number} 삭제', 'Удалить угол {number}'],
  ['layout.apply_room', 'Update room', '部屋を更新', 'Actualizar habitación', '방 업데이트', 'Обновить комнату'],
  ['layout.furniture', 'Furniture', '家具', 'Muebles', '가구', 'Мебель'],
  ['layout.add_desk', 'Add desk', '机を追加', 'Añadir mesa', '책상 추가', 'Добавить стол'],
  ['layout.add_shelf', 'Add shelf', '棚を追加', 'Añadir estantería', '선반 추가', 'Добавить стеллаж'],
  ['layout.desk', 'Desk', '机', 'Mesa', '책상', 'Стол'],
  ['layout.shelf', 'Shelf', '棚', 'Estantería', '선반', 'Стеллаж'],
  ['layout.desk_name', 'Desk {number}', '机 {number}', 'Mesa {number}', '책상 {number}', 'Стол {number}'],
  ['layout.shelf_name', 'Shelf {number}', '棚 {number}', 'Estantería {number}', '선반 {number}', 'Стеллаж {number}'],
  ['layout.tabletop_thickness', 'Desktop thickness', '天板の厚み', 'Grosor del tablero', '책상 상판 두께', 'Толщина столешницы'],
  ['layout.board_thickness', 'Shelf board thickness', '棚板の厚み', 'Grosor de las baldas', '선반판 두께', 'Толщина полок'],
  ['layout.levels', 'Shelf levels', '棚の段', 'Baldas', '선반 단', 'Полки'],
  ['layout.level', 'Level {number}', '{number}段目', 'Balda {number}', '{number}단', 'Полка {number}'],
  ['layout.level_height', 'Height from floor', '床からの高さ', 'Altura desde el suelo', '바닥에서 높이', 'Высота от пола'],
  ['layout.add_level', 'Add level', '段を追加', 'Añadir balda', '단 추가', 'Добавить полку'],
  ['layout.remove_level', 'Remove level', '段を削除', 'Eliminar balda', '단 삭제', 'Удалить полку'],
  ['layout.printers', 'Printers', 'プリンター', 'Impresoras', '프린터', 'Принтеры'],
  ['layout.add_printer', 'Add printer', 'プリンターを追加', 'Añadir impresora', '프린터 추가', 'Добавить принтер'],
  ['layout.choose_printer', 'Choose a printer', 'プリンターを選択', 'Elige una impresora', '프린터 선택', 'Выберите принтер'],
  ['layout.search_printers', 'Find a printer', 'プリンターを検索', 'Buscar impresora', '프린터 찾기', 'Найти принтер'],
  ['layout.search_placeholder', 'Search model or size', '機種・サイズで検索', 'Buscar modelo o tamaño', '모델 또는 크기 검색', 'Модель или размер'],
  ['layout.all_families', 'All families', 'すべてのシリーズ', 'Todas las familias', '모든 제품군', 'Все серии'],
  ['layout.family', 'Family', 'シリーズ', 'Familia', '제품군', 'Серия'],
  ['layout.no_printers', 'No printers found. Try another search.', '見つかりませんでした。検索条件を変えてください。', 'No se encontraron impresoras. Prueba otra búsqueda.', '프린터를 찾지 못했습니다. 다른 검색어를 입력해 주세요.', 'Принтеры не найдены. Измените запрос.'],
  ['layout.catalog_count', 'Printers: {count}', 'プリンター：{count}機種', 'Impresoras: {count}', '프린터: {count}종', 'Принтеры: {count}'],
  ['layout.catalog_loading', 'Loading printers…', 'プリンターを読み込み中…', 'Cargando impresoras…', '프린터를 불러오는 중…', 'Загрузка принтеров…'],
  ['layout.catalog_error', 'The printer list could not load. Try again.', 'プリンター一覧を読み込めませんでした。再試行してください。', 'No se pudo cargar la lista de impresoras. Vuelve a intentarlo.', '프린터 목록을 불러오지 못했습니다. 다시 시도해 주세요.', 'Не удалось загрузить список принтеров. Повторите попытку.'],
  ['layout.printer_preview', 'Preview of {name}', '{name} のプレビュー', 'Vista previa de {name}', '{name} 미리보기', 'Предпросмотр: {name}'],
  ['layout.model_size', 'Model size', 'モデルの外寸', 'Dimensiones del modelo', '모델 외형 크기', 'Размеры модели'],
  ['layout.size_value', '{width} × {depth} × {height} {unit}', '{width} × {depth} × {height} {unit}', '{width} × {depth} × {height} {unit}', '{width} × {depth} × {height} {unit}', '{width} × {depth} × {height} {unit}'],
  ['layout.size_order', 'Width × depth × height', '幅 × 奥行き × 高さ', 'Ancho × fondo × alto', '너비 × 깊이 × 높이', 'Ширина × глубина × высота'],
  ['layout.open_printer', 'Open printer viewer', 'プリンターのビューアーを開く', 'Abrir visor de la impresora', '프린터 뷰어 열기', 'Открыть просмотр принтера'],
  ['layout.selected', 'Selected item', '選択中', 'Elemento seleccionado', '선택한 항목', 'Выбранный объект'],
  ['layout.nothing_selected', 'Select an item to edit it.', '編集するものを選んでください。', 'Selecciona un elemento para editarlo.', '편집할 항목을 선택하세요.', 'Выберите объект для изменения.'],
  ['layout.select_item', 'Select {name}', '{name} を選択', 'Seleccionar {name}', '{name} 선택', 'Выбрать {name}'],
  ['layout.remove_item', 'Remove {name}', '{name} を削除', 'Eliminar {name}', '{name} 삭제', 'Удалить {name}'],
  ['layout.position', 'Position', '位置', 'Posición', '위치', 'Положение'],
  ['layout.position_x', 'Left / right (X)', '左右（X）', 'Izquierda / derecha (X)', '좌우 (X)', 'Влево / вправо (X)'],
  ['layout.position_z', 'Front / back (Z)', '前後（Z）', 'Delante / detrás (Z)', '앞뒤 (Z)', 'Вперёд / назад (Z)'],
  ['layout.rotation', 'Rotation', '回転', 'Giro', '회전', 'Поворот'],
  ['layout.rotate_left', 'Rotate left', '左に回転', 'Girar a la izquierda', '왼쪽으로 회전', 'Повернуть влево'],
  ['layout.rotate_right', 'Rotate right', '右に回転', 'Girar a la derecha', '오른쪽으로 회전', 'Повернуть вправо'],
  ['layout.place_on', 'Place on', '置く場所', 'Colocar en', '놓을 곳', 'Разместить на'],
  ['layout.floor', 'Floor', '床', 'Suelo', '바닥', 'Пол'],
  ['layout.desktop', 'Desktop', '机の天板', 'Tablero de la mesa', '책상 상판', 'Столешница'],
  ['layout.surface_name', '{name} · {surface}', '{name} · {surface}', '{name} · {surface}', '{name} · {surface}', '{name} · {surface}'],
  ['layout.local_position', 'Position on furniture', '家具の上での位置', 'Posición sobre el mueble', '가구 위 위치', 'Положение на мебели'],
  ['layout.follows_furniture', 'The printer moves with its desk or shelf.', 'プリンターは机や棚と一緒に動きます。', 'La impresora se mueve junto con su mesa o estantería.', '프린터가 책상이나 선반과 함께 이동합니다.', 'Принтер перемещается вместе со столом или стеллажом.'],
  ['layout.remove_occupied', 'This furniture holds printers. Move them to the floor before removing it.', 'この家具にはプリンターがあります。床へ移してから削除してください。', 'Este mueble tiene impresoras. Muévelas al suelo antes de eliminarlo.', '이 가구 위에 프린터가 있습니다. 바닥으로 옮긴 뒤 삭제해 주세요.', 'На мебели стоят принтеры. Перед удалением переместите их на пол.'],
  ['layout.move_to_floor', 'Move printers to floor', 'プリンターを床へ移動', 'Mover impresoras al suelo', '프린터를 바닥으로 이동', 'Переместить принтеры на пол'],
  ['layout.remove_occupied_level', 'Move the printers off this level before removing it.', 'この段のプリンターを移してから削除してください。', 'Mueve las impresoras de esta balda antes de eliminarla.', '이 단의 프린터를 옮긴 뒤 삭제해 주세요.', 'Перед удалением полки уберите с неё принтеры.'],
  ['layout.view', 'View', '表示', 'Vista', '보기', 'Вид'],
  ['layout.top_view', '2D plan', '平面図', 'Plano 2D', '평면도', 'План 2D'],
  ['layout.perspective', '3D view', '3D表示', 'Vista 3D', '3D 보기', 'Вид 3D'],
  ['layout.front_view', 'Front view', '正面から', 'De frente', '앞에서 보기', 'Спереди'],
  ['layout.fit_view', 'Show whole layout', '全体を表示', 'Ver toda la distribución', '전체 배치 보기', 'Показать всю планировку'],
  ['layout.zoom_in', 'Zoom in', '拡大', 'Acercar', '확대', 'Приблизить'],
  ['layout.zoom_out', 'Zoom out', '縮小', 'Alejar', '축소', 'Отдалить'],
  ['layout.grid', 'Grid', 'グリッド', 'Cuadrícula', '격자', 'Сетка'],
  ['layout.walls', 'Walls', '壁', 'Paredes', '벽', 'Стены'],
  ['layout.dimensions', 'Dimensions', '寸法', 'Dimensiones', '치수', 'Размеры'],
  ['layout.simple_view', 'Simple view', 'シンプル表示', 'Vista sencilla', '간단히 보기', 'Упрощённый вид'],
  ['layout.detailed_view', 'Detailed view', '詳細表示', 'Vista detallada', '자세히 보기', 'Подробный вид'],
  ['layout.simple_note', 'Simple shapes make it easier to arrange your space.', '配置しやすいよう、シンプルな形で表示します。', 'Las formas sencillas facilitan la distribución del espacio.', '간단한 모양으로 공간을 쉽게 배치할 수 있습니다.', 'Простые формы помогают расставить объекты.'],
  ['layout.details_note', 'Load printer models to see more detail.', 'プリンターモデルを読み込むと詳しく見られます。', 'Carga los modelos de impresora para ver más detalles.', '프린터 모델을 불러오면 자세히 볼 수 있습니다.', 'Загрузите модели принтеров для подробного просмотра.'],
  ['layout.load_details', 'Load printer models', 'プリンターモデルを読み込む', 'Cargar modelos de impresora', '프린터 모델 불러오기', 'Загрузить модели принтеров'],
  ['layout.details_loading', 'Loading {name}…', '{name} を読み込み中…', 'Cargando {name}…', '{name} 불러오는 중…', 'Загрузка: {name}…'],
  ['layout.details_progress', 'Models loaded: {loaded} / {total}', '読み込み済み：{loaded} / {total}', 'Modelos cargados: {loaded} / {total}', '불러온 모델: {loaded} / {total}', 'Загружено моделей: {loaded} / {total}'],
  ['layout.details_error', '{name} could not load. Try again or use Simple view.', '{name} を読み込めませんでした。再試行するか、シンプル表示を使ってください。', 'No se pudo cargar {name}. Vuelve a intentarlo o usa la vista sencilla.', '{name}을(를) 불러오지 못했습니다. 다시 시도하거나 간단히 보기를 사용하세요.', 'Не удалось загрузить {name}. Повторите попытку или выберите упрощённый вид.'],
  ['layout.details_cancel', 'Stop loading', '読み込みを中止', 'Detener carga', '불러오기 중지', 'Остановить загрузку'],
  ['layout.details_limit', 'This layout has too many detailed models to load at once. Use Simple view or fewer printers.', '詳細モデルを一度に読み込める数を超えています。シンプル表示にするか、プリンターを減らしてください。', 'Hay demasiados modelos detallados para cargarlos a la vez. Usa la vista sencilla o reduce el número de impresoras.', '상세 모델을 한 번에 불러오기에는 프린터가 너무 많습니다. 간단히 보기를 사용하거나 프린터 수를 줄여 주세요.', 'Слишком много подробных моделей для одновременной загрузки. Выберите упрощённый вид или уменьшите число принтеров.'],
  ['layout.appearance', 'Appearance', '見た目', 'Apariencia', '화면 모양', 'Оформление'],
  ['layout.light_theme', 'Light theme', 'ライトモード', 'Tema claro', '밝은 테마', 'Светлая тема'],
  ['layout.dark_theme', 'Dark theme', 'ダークモード', 'Tema oscuro', '어두운 테마', 'Тёмная тема'],
  ['layout.checks', 'Space checks', '配置の確認', 'Revisión del espacio', '배치 확인', 'Проверка размещения'],
  ['layout.repairBounds', 'Some items extend beyond the room or their support. Move them inside before creating a 3D image. You can still edit and export the 2D plan.', '部屋や天板からはみ出したものがあります。位置を直すと3D画像を作成できます。平面図の編集と画像出力は引き続き使えます。', 'Algunos objetos sobresalen de la habitación o de su soporte. Colócalos dentro antes de crear una imagen 3D. Puedes seguir editando y exportando el plano 2D.', '방이나 받침면 밖으로 나간 물체가 있습니다. 위치를 수정하면 3D 이미지를 만들 수 있습니다. 평면도 편집과 이미지 출력은 계속 사용할 수 있습니다.', 'Некоторые объекты выходят за границы комнаты или опоры. Переместите их внутрь перед созданием 3D-изображения. План 2D можно редактировать и сохранять как изображение.'],
  ['layout.outside_room', '{name} extends outside the room.', '{name} が部屋の外にはみ出しています。', '{name} sobresale de la habitación.', '{name}이(가) 방 밖으로 나와 있습니다.', '{name} выходит за пределы комнаты.'],
  ['layout.outside_surface', '{name} extends beyond its desk or shelf.', '{name} が机や棚からはみ出しています。', '{name} sobresale de su mesa o balda.', '{name}이(가) 책상이나 선반 밖으로 나와 있습니다.', '{name} выступает за край стола или полки.'],
  ['layout.overlap', 'The space shown for {first} overlaps {second}.', '{first} と {second} の表示範囲が重なっています。', 'El espacio mostrado para {first} se solapa con {second}.', '{first}과(와) {second}의 표시 영역이 겹칩니다.', 'Показанное пространство для {first} пересекается с {second}.'],
  ['layout.too_tall', '{name} reaches the shelf above.', '{name} が上の棚板に届いています。', '{name} alcanza la balda superior.', '{name}이(가) 위쪽 선반판에 닿습니다.', '{name} достигает полки сверху.'],
  ['layout.above_walls', '{name} is taller than the room height.', '{name} が部屋の高さを超えています。', '{name} supera la altura de la habitación.', '{name}이(가) 방 높이보다 높습니다.', '{name} выше заданной высоты комнаты.'],
  ['layout.no_space_warnings', 'No overlaps found in the space shown.', '表示範囲に重なりはありません。', 'No se encontraron solapamientos en el espacio mostrado.', '표시된 영역에는 겹침이 없습니다.', 'В показанном пространстве пересечений не найдено.'],
  ['layout.space_note', 'Checks use the space shown. Allow room for moving parts, cables and access.', '確認の対象は表示範囲です。可動部・配線・作業に必要な余裕も確保してください。', 'Las comprobaciones usan el espacio mostrado. Deja sitio para las piezas móviles, los cables y el acceso.', '표시된 영역을 기준으로 확인합니다. 움직이는 부품, 케이블, 작업 공간도 확보해 주세요.', 'Проверяется показанное пространство. Оставьте место для подвижных деталей, кабелей и доступа.'],
  ['layout.movement_space', 'Space for movement', '動作に必要な空間', 'Espacio para el movimiento', '동작에 필요한 공간', 'Пространство для движения'],
  ['layout.movement_unknown', 'Space for movement is not available for this model.', 'このモデルの動作に必要な空間は未登録です。', 'No se dispone del espacio de movimiento para este modelo.', '이 모델의 동작 공간 정보는 없습니다.', 'Для этой модели пространство для движения не указано.'],
  ['layout.extra_space', 'Extra space', '追加の余裕', 'Espacio adicional', '추가 여유 공간', 'Дополнительное пространство'],
  ['layout.extra_space_note', 'Add the space you want to keep clear.', '空けておきたい余裕を設定できます。', 'Indica el espacio que quieres dejar libre.', '비워 둘 여유 공간을 설정하세요.', 'Задайте пространство, которое хотите оставить свободным.'],
  ['layout.save', 'Save layout', 'レイアウトを保存', 'Guardar distribución', '배치 저장', 'Сохранить планировку'],
  ['layout.load', 'Load layout', 'レイアウトを開く', 'Abrir distribución', '배치 불러오기', 'Открыть планировку'],
  ['layout.new', 'New layout', '新しいレイアウト', 'Nueva distribución', '새 배치', 'Новая планировка'],
  ['layout.new_confirm', 'Start a new layout? Save this one first if you want to keep it.', '新しいレイアウトを始めますか？残す場合は先に保存してください。', '¿Empezar una distribución nueva? Guarda esta primero si quieres conservarla.', '새 배치를 시작할까요? 현재 배치를 보관하려면 먼저 저장하세요.', 'Создать новую планировку? Сначала сохраните текущую, если хотите её оставить.'],
  ['layout.loaded', 'Layout loaded.', 'レイアウトを開きました。', 'Distribución cargada.', '배치를 불러왔습니다.', 'Планировка загружена.'],
  ['layout.load_error', 'This layout could not be opened. Your current layout is unchanged.', 'このレイアウトを開けませんでした。現在の配置は変更していません。', 'No se pudo abrir esta distribución. La actual no ha cambiado.', '이 배치를 열지 못했습니다. 현재 배치는 변경되지 않았습니다.', 'Не удалось открыть планировку. Текущая планировка не изменена.'],
  ['layout.unsupported_version', 'This layout uses a version that cannot be opened here.', 'このバージョンのレイアウトは開けません。', 'Esta distribución usa una versión que no se puede abrir aquí.', '이 버전의 배치는 여기서 열 수 없습니다.', 'Эту версию планировки открыть нельзя.'],
  ['layout.unknown_machine', 'A printer in this layout is not in the current list.', 'このレイアウトには一覧にないプリンターが含まれています。', 'Una impresora de esta distribución no está en la lista actual.', '이 배치에 현재 목록에 없는 프린터가 있습니다.', 'В планировке есть принтер, которого нет в текущем списке.'],
  ['layout.file_too_large', 'This layout file is too large to open.', 'レイアウトファイルが大きすぎるため開けません。', 'El archivo de distribución es demasiado grande.', '배치 파일이 너무 커서 열 수 없습니다.', 'Файл планировки слишком большой.'],
  ['layout.export_image', 'Export image', '画像を書き出す', 'Exportar imagen', '이미지 내보내기', 'Экспорт изображения'],
  ['layout.exporting', 'Preparing image…', '画像を準備中…', 'Preparando imagen…', '이미지 준비 중…', 'Подготовка изображения…'],
  ['layout.export_error', 'The image could not be saved. Try again.', '画像を保存できませんでした。再試行してください。', 'No se pudo guardar la imagen. Vuelve a intentarlo.', '이미지를 저장하지 못했습니다. 다시 시도해 주세요.', 'Не удалось сохранить изображение. Повторите попытку.'],
  ['layout.export_ready', 'Image ready.', '画像を準備しました。', 'Imagen lista.', '이미지가 준비되었습니다.', 'Изображение готово.'],
  ['layout.invalid_room', 'Use at least three corners with no crossing edges.', '辺が交差しないように、3つ以上の角で部屋を作ってください。', 'Usa al menos tres esquinas sin que los lados se crucen.', '변이 교차하지 않도록 모서리를 세 개 이상 지정하세요.', 'Задайте не менее трёх углов без пересекающихся сторон.'],
  ['layout.invalid_dimension', 'Enter a size greater than zero.', '0より大きいサイズを入力してください。', 'Introduce una dimensión mayor que cero.', '0보다 큰 크기를 입력해 주세요.', 'Введите размер больше нуля.'],
  ['layout.invalid_number', 'Enter a valid number.', '有効な数値を入力してください。', 'Introduce un número válido.', '올바른 숫자를 입력해 주세요.', 'Введите корректное число.'],
  ['layout.out_of_range', 'Enter a value from {min} to {max}.', '{min}から{max}の値を入力してください。', 'Introduce un valor entre {min} y {max}.', '{min}부터 {max} 사이의 값을 입력해 주세요.', 'Введите значение от {min} до {max}.'],
  ['layout.invalid_levels', 'Keep shelf levels above the floor, apart and within the shelf height.', '棚の段は床より上で、互いに重ならず、棚の高さ以内に設定してください。', 'Coloca las baldas sobre el suelo, separadas y dentro de la altura de la estantería.', '선반 단을 바닥 위에 서로 떨어지게 배치하고 선반 높이 안에 두세요.', 'Расположите полки над полом, без пересечений и в пределах высоты стеллажа.'],
  ['layout.invalid_surface', 'Choose an existing floor, desktop or shelf level.', '床・机の天板・棚の段から置く場所を選んでください。', 'Elige el suelo, un tablero de mesa o una balda existente.', '바닥, 책상 상판 또는 현재 있는 선반 단을 선택해 주세요.', 'Выберите пол, столешницу или существующую полку.'],
  ['layout.change_rejected', 'This change could not be applied. Check the selected item and its measurements.', '変更を適用できませんでした。選択したものと寸法を確認してください。', 'No se pudo aplicar el cambio. Revisa el elemento seleccionado y sus medidas.', '변경할 수 없습니다. 선택한 항목과 치수를 확인해 주세요.', 'Не удалось применить изменение. Проверьте выбранный объект и размеры.'],
  ['layout.source_info', 'Model sources', 'モデルの出典', 'Fuentes de los modelos', '모델 출처', 'Источники моделей'],
  ['layout.sources_note', 'Original model credits and licenses are in each printer viewer.', '元モデルの作者・ライセンスは各プリンターのビューアーで確認できます。', 'Los autores y las licencias originales están en el visor de cada impresora.', '원본 모델의 제작자와 라이선스는 각 프린터 뷰어에서 확인할 수 있습니다.', 'Авторы исходных моделей и лицензии указаны в просмотре каждого принтера.'],
];

rows.push(
  ['layout.sceneControls', 'View controls', '表示の操作', 'Controles de vista', '보기 조작', 'Управление видом'],
  ['layout.tool', 'Tool', '操作', 'Herramienta', '도구', 'Инструмент'],
  ['layout.tool.orbit', 'Look around', '見回す', 'Mirar alrededor', '둘러보기', 'Осмотреть'],
  ['layout.tool.move', 'Move', '移動', 'Mover', '이동', 'Переместить'],
  ['layout.previewBadge', 'Simple preview', 'シンプルプレビュー', 'Vista previa sencilla', '간단한 미리보기', 'Упрощённый просмотр'],
  ['layout.hint.orbit', 'Drag to look around. Scroll or pinch to zoom.', 'ドラッグで見回す。スクロールやピンチで拡大・縮小できます。', 'Arrastra para mirar alrededor. Usa la rueda o pellizca para acercar.', '드래그해 둘러보세요. 스크롤하거나 두 손가락으로 확대·축소하세요.', 'Перетаскивайте для осмотра. Колесо или жест пальцами меняют масштаб.'],
  ['layout.hint.move', 'Select an item and drag to move it. Use the position fields for precise placement.', '選んでドラッグすると移動できます。位置の入力欄で正確に配置できます。', 'Selecciona un elemento y arrástralo. Usa los campos de posición para colocarlo con precisión.', '항목을 선택해 드래그하세요. 위치 입력란에서 정확하게 배치할 수 있습니다.', 'Выберите объект и перетащите его. Для точного размещения используйте поля положения.'],
  ['layout.hint.auto', 'Drag objects to move them. Drag empty space to look around. Right-drag to pan.', '置いたものをドラッグして移動。何もない場所をドラッグすると見回せます。右ドラッグで表示を移動します。', 'Arrastra los objetos para moverlos y un espacio vacío para girar la vista. Arrastra con el botón derecho para desplazarla.', '물체를 드래그하면 이동하고 빈 곳을 드래그하면 시점이 회전합니다. 오른쪽 버튼으로 드래그하면 화면이 이동합니다.', 'Перетаскивайте объекты для перемещения, пустую область для поворота вида. Правой кнопкой перемещайте вид.'],
  ['layout.hint.plan', 'Drag objects to move them. Drag empty space to pan. Scroll to zoom.', '置いたものをドラッグして移動。何もない場所をドラッグすると表示が移動します。スクロールで拡大・縮小できます。', 'Arrastra los objetos para moverlos y un espacio vacío para desplazar el plano. Usa la rueda para acercar o alejar.', '물체를 드래그하면 이동하고 빈 곳을 드래그하면 화면이 이동합니다. 스크롤로 확대·축소할 수 있습니다.', 'Перетаскивайте объекты для перемещения, пустую область для сдвига плана. Колесо меняет масштаб.'],
  ['layout.theme', 'Switch theme', '表示モードを切り替え', 'Cambiar tema', '테마 전환', 'Сменить тему'],
  ['layout.skipToSettings', 'Skip to settings', '設定へスキップ', 'Ir a los ajustes', '설정으로 건너뛰기', 'Перейти к настройкам'],
  ['layout.memoryHint', 'Simple preview uses less memory. Load full models when you are ready to make an image.', 'シンプルプレビューはメモリ使用量を抑えます。画像を作るときに詳細モデルを読み込めます。', 'La vista sencilla usa menos memoria. Carga los modelos completos cuando quieras crear una imagen.', '간단한 미리보기는 메모리를 적게 사용합니다. 이미지를 만들 때 전체 모델을 불러올 수 있습니다.', 'Упрощённый просмотр использует меньше памяти. Загрузите полные модели, когда будете создавать изображение.'],
  ['layout.render.loading', 'Preparing printer models…', 'プリンターモデルを準備中…', 'Preparando modelos de impresora…', '프린터 모델 준비 중…', 'Подготовка моделей принтеров…'],
  ['layout.render.planLoading', 'Creating plan image…', '平面図を画像にしています…', 'Creando la imagen del plano…', '평면도 이미지 생성 중…', 'Создание изображения плана…'],
  ['layout.render.planAlt', '2D room plan with furniture and printer footprints', '家具とプリンターの設置面を示す平面図', 'Plano 2D de la habitación con muebles y huellas de las impresoras', '가구와 프린터의 설치 면적이 표시된 평면도', 'План комнаты с мебелью и контурами принтеров'],
  ['layout.render.progress', 'Printer {current} of {total} · {percent}%', 'プリンター {current} / {total} · {percent}%', 'Impresora {current} de {total} · {percent}%', '프린터 {current} / {total} · {percent}%', 'Принтер {current} из {total} · {percent}%'],
  ['layout.render.result', 'Your layout image', 'レイアウトの画像', 'Imagen de tu distribución', '배치 이미지', 'Изображение планировки'],
  ['layout.render.alt', 'Room layout with furniture and printer models', '家具とプリンターモデルを配置した部屋', 'Habitación con muebles y modelos de impresora', '가구와 프린터 모델이 배치된 방', 'Комната с мебелью и моделями принтеров'],
  ['layout.render.download', 'Save image', '画像を保存', 'Guardar imagen', '이미지 저장', 'Сохранить изображение'],
  ['layout.render.currentView', 'This image uses your current view.', '現在の視点で作成した画像です。', 'Esta imagen usa tu vista actual.', '현재 시점으로 만든 이미지입니다.', 'Изображение создано с текущего ракурса.'],
  ['layout.render.complete', 'Image ready · {width} × {height}', '画像を準備しました · {width} × {height}', 'Imagen lista · {width} × {height}', '이미지 준비 완료 · {width} × {height}', 'Изображение готово · {width} × {height}'],
  ['layout.render.cancelled', 'Image creation stopped.', '画像の作成を中止しました。', 'Se ha detenido la creación de la imagen.', '이미지 만들기를 중지했습니다.', 'Создание изображения остановлено.'],
  ['layout.error.generic', 'This change could not be completed. Try again.', '処理できませんでした。再試行してください。', 'No se pudo completar el cambio. Vuelve a intentarlo.', '처리하지 못했습니다. 다시 시도해 주세요.', 'Не удалось выполнить действие. Повторите попытку.'],
  ['layout.error.savedPlan', 'The saved layout could not be opened. A new layout is shown.', '保存済みの配置を開けなかったため、新しい配置を表示しています。', 'No se pudo abrir la distribución guardada. Se muestra una nueva.', '저장된 배치를 열지 못해 새 배치를 표시합니다.', 'Не удалось открыть сохранённую планировку. Показана новая.'],
  ['layout.error.start', 'The planner could not start. Reload the page to try again.', 'プランナーを開けませんでした。ページを再読み込みしてください。', 'No se pudo iniciar el planificador. Recarga la página.', '플래너를 열지 못했습니다. 페이지를 새로고침해 주세요.', 'Не удалось открыть планировщик. Обновите страницу.'],
  ['layout.error.RENDER_TRANSPARENCY_BUDGET', 'There are too many transparent parts to make this image. Try fewer printers.', '透明な部品が多すぎるため画像を作成できません。プリンターを減らして再試行してください。', 'Hay demasiadas piezas transparentes para crear esta imagen. Prueba con menos impresoras.', '투명한 부품이 너무 많아 이미지를 만들 수 없습니다. 프린터 수를 줄여 주세요.', 'Слишком много прозрачных деталей для создания изображения. Уменьшите число принтеров.'],
  ['layout.error.EXPECTED_OBJECT', 'An item in this layout could not be read. Check the saved file.', '配置に読み取れない項目があります。保存ファイルを確認してください。', 'No se pudo leer un elemento. Revisa el archivo guardado.', '배치의 항목을 읽지 못했습니다. 저장 파일을 확인해 주세요.', 'Не удалось прочитать объект. Проверьте сохранённый файл.'],
  ['layout.error.UNKNOWN_FIELD', 'This layout contains settings this version cannot read.', 'このバージョンで読み取れない設定が含まれています。', 'Esta distribución contiene ajustes que esta versión no puede leer.', '이 버전에서 읽을 수 없는 설정이 포함되어 있습니다.', 'В планировке есть настройки, которые эта версия не поддерживает.'],
  ['layout.error.NUMBER_OUT_OF_RANGE', 'A size or position is outside the allowed range. Check your measurements.', 'サイズか位置が入力範囲を超えています。寸法を確認してください。', 'Un tamaño o una posición está fuera del intervalo permitido. Revisa las medidas.', '크기나 위치가 입력 범위를 벗어났습니다. 치수를 확인해 주세요.', 'Размер или положение вне допустимого диапазона. Проверьте значения.'],
  ['layout.error.INVALID_ID', 'An item in this layout could not be identified. Check the saved file.', '配置の項目を識別できません。保存ファイルを確認してください。', 'No se pudo identificar un elemento. Revisa el archivo guardado.', '배치의 항목을 식별하지 못했습니다. 저장 파일을 확인해 주세요.', 'Не удалось определить объект. Проверьте сохранённый файл.'],
  ['layout.error.ROOM_EXTENT_LIMIT', 'The room is too large. Reduce its width or depth.', '部屋が大きすぎます。幅か奥行きを小さくしてください。', 'La habitación es demasiado grande. Reduce el ancho o el fondo.', '방이 너무 큽니다. 너비나 깊이를 줄여 주세요.', 'Комната слишком большая. Уменьшите ширину или глубину.'],
  ['layout.error.UNKNOWN_FURNITURE_TYPE', 'Choose a desk or shelf.', '机か棚を選んでください。', 'Elige una mesa o estantería.', '책상 또는 선반을 선택해 주세요.', 'Выберите стол или стеллаж.'],
  ['layout.error.DESK_TOP_FIXED_30_MM', 'This desk uses a 30 mm desktop.', 'この机の天板は30 mmです。', 'Esta mesa usa un tablero de 30 mm.', '이 책상은 상판 두께가 30 mm입니다.', 'У этого стола столешница толщиной 30 мм.'],
  ['layout.error.SHELF_LEVEL_COUNT', 'Use between 1 and 32 shelf levels.', '棚は1〜32段にしてください。', 'Usa entre 1 y 32 baldas.', '선반을 1~32단으로 설정해 주세요.', 'Задайте от 1 до 32 полок.'],
  ['layout.error.DUPLICATE_LEVEL_ID', 'Two shelf levels have the same label. Check the saved file.', '同じ識別名の段が重複しています。保存ファイルを確認してください。', 'Dos baldas tienen la misma identificación. Revisa el archivo guardado.', '같은 식별 이름의 선반 단이 중복되어 있습니다. 저장 파일을 확인해 주세요.', 'Две полки имеют одинаковое обозначение. Проверьте сохранённый файл.'],
  ['layout.error.SHELF_BOARDS_OVERLAP_OR_UNORDERED', 'Place shelf levels in order, with room between their boards.', '棚の段を下から順に、棚板が重ならない間隔で並べてください。', 'Ordena las baldas de abajo arriba sin que sus tableros se solapen.', '선반 단을 아래에서 위로 정렬하고 판이 겹치지 않게 배치해 주세요.', 'Расположите полки снизу вверх, без пересечения досок.'],
  ['layout.error.FLOOR_SURFACE_REQUIRED', 'Choose the floor or an existing piece of furniture.', '床か、配置済みの家具を選んでください。', 'Elige el suelo o un mueble existente.', '바닥 또는 배치된 가구를 선택해 주세요.', 'Выберите пол или существующую мебель.'],
  ['layout.error.UNKNOWN_PARENT', 'The furniture for this printer is missing. Choose where to place it.', 'このプリンターを置く家具がありません。置く場所を選び直してください。', 'Falta el mueble de esta impresora. Elige dónde colocarla.', '이 프린터를 놓을 가구가 없습니다. 놓을 곳을 다시 선택해 주세요.', 'Мебель для этого принтера отсутствует. Выберите место заново.'],
  ['layout.error.CATALOG_ARRAY_REQUIRED', 'The printer list could not be read. Reload the page.', 'プリンター一覧を読み取れませんでした。ページを再読み込みしてください。', 'No se pudo leer la lista de impresoras. Recarga la página.', '프린터 목록을 읽지 못했습니다. 페이지를 새로고침해 주세요.', 'Не удалось прочитать список принтеров. Обновите страницу.'],
  ['layout.error.DUPLICATE_MACHINE_ID', 'The printer list contains a repeated entry. Reload the page.', 'プリンター一覧に重複があります。ページを再読み込みしてください。', 'La lista de impresoras contiene una entrada repetida. Recarga la página.', '프린터 목록에 중복 항목이 있습니다. 페이지를 새로고침해 주세요.', 'В списке принтеров есть повторная запись. Обновите страницу.'],
  ['layout.error.FORMAT_UNSUPPORTED', 'Choose a layout saved by this planner.', 'このプランナーで保存したレイアウトを選んでください。', 'Elige una distribución guardada por este planificador.', '이 플래너에서 저장한 배치를 선택해 주세요.', 'Выберите планировку, сохранённую в этом планировщике.'],
  ['layout.error.UNITS_MUST_BE_MM', 'This layout must use millimetres.', 'このレイアウトの単位はmmにしてください。', 'Esta distribución debe usar milímetros.', '이 배치의 단위는 밀리미터여야 합니다.', 'В этой планировке должны использоваться миллиметры.'],
  ['layout.error.FURNITURE_COUNT', 'A layout can contain up to 64 pieces of furniture.', '家具は64個まで配置できます。', 'Una distribución admite hasta 64 muebles.', '가구는 최대 64개까지 배치할 수 있습니다.', 'В планировке может быть до 64 предметов мебели.'],
  ['layout.error.PRINTER_COUNT', 'A layout can contain up to 128 printers.', 'プリンターは128台まで配置できます。', 'Una distribución admite hasta 128 impresoras.', '프린터는 최대 128대까지 배치할 수 있습니다.', 'В планировке может быть до 128 принтеров.'],
  ['layout.error.DUPLICATE_ENTITY_ID', 'Two items have the same label. Check the saved file.', '同じ識別名の項目が重複しています。保存ファイルを確認してください。', 'Dos elementos tienen la misma identificación. Revisa el archivo guardado.', '같은 식별 이름의 항목이 중복되어 있습니다. 저장 파일을 확인해 주세요.', 'Два объекта имеют одинаковое обозначение. Проверьте сохранённый файл.'],
  ['layout.error.INVALID_CONFIGURATION_ID', 'The printer configuration could not be read. Check the saved file.', 'プリンターの構成を読み取れません。保存ファイルを確認してください。', 'No se pudo leer la configuración de la impresora. Revisa el archivo guardado.', '프린터 구성을 읽지 못했습니다. 저장 파일을 확인해 주세요.', 'Не удалось прочитать конфигурацию принтера. Проверьте сохранённый файл.'],
  ['layout.error.L_CUT_MUST_BE_INTERIOR', 'Make the inset smaller than the room width and depth.', 'くぼみは部屋の幅・奥行きより小さくしてください。', 'Haz el entrante menor que el ancho y el fondo de la habitación.', '들어간 부분을 방 너비와 깊이보다 작게 설정해 주세요.', 'Вырез должен быть меньше ширины и глубины комнаты.'],
  ['layout.error.UNKNOWN_ENTITY', 'This item is no longer in the layout. Select another item.', 'この項目はすでに削除されています。別のものを選んでください。', 'Este elemento ya no está en la distribución. Selecciona otro.', '이 항목은 배치에서 삭제되었습니다. 다른 항목을 선택해 주세요.', 'Этого объекта больше нет в планировке. Выберите другой.'],
  ['layout.error.EXPECTED_BOOLEAN', 'Choose whether to move the printers to the floor before removing the furniture.', '家具を削除する前に、プリンターを床へ移すか選んでください。', 'Elige si quieres mover las impresoras al suelo antes de eliminar el mueble.', '가구를 삭제하기 전에 프린터를 바닥으로 옮길지 선택해 주세요.', 'Выберите, переносить ли принтеры на пол перед удалением мебели.'],
  ['layout.error.POLYGON_VERTEX_COUNT', 'Use between 3 and 32 room corners.', '部屋の角は3〜32個にしてください。', 'Usa entre 3 y 32 esquinas.', '방 모서리를 3~32개로 설정해 주세요.', 'Задайте от 3 до 32 углов комнаты.'],
  ['layout.error.POLYGON_COORDINATE', 'Enter valid numbers for the room corners.', '部屋の角の位置に有効な数値を入力してください。', 'Introduce números válidos para las esquinas.', '방 모서리 위치에 올바른 숫자를 입력해 주세요.', 'Введите корректные координаты углов комнаты.'],
  ['layout.error.POLYGON_ZERO_EDGE', 'Two neighbouring room corners share a position. Move or remove one.', '隣り合う角が同じ位置にあります。片方を移動するか削除してください。', 'Dos esquinas contiguas comparten posición. Mueve o elimina una.', '이웃한 두 모서리의 위치가 같습니다. 하나를 옮기거나 삭제해 주세요.', 'Два соседних угла совпадают. Переместите или удалите один.'],
  ['layout.error.POLYGON_BACKTRACK', 'A room edge doubles back on itself. Adjust the corners.', '部屋の辺が同じ線を折り返しています。角の位置を調整してください。', 'Un lado de la habitación retrocede sobre sí mismo. Ajusta las esquinas.', '방의 변이 같은 선을 되짚고 있습니다. 모서리를 조정해 주세요.', 'Сторона комнаты идёт обратно по той же линии. Измените углы.'],
  ['layout.error.POLYGON_REPEATED_VERTEX', 'Two room corners share a position. Move or remove one.', '同じ位置の角があります。片方を移動するか削除してください。', 'Dos esquinas comparten posición. Mueve o elimina una.', '같은 위치의 모서리가 있습니다. 하나를 옮기거나 삭제해 주세요.', 'Два угла комнаты совпадают. Переместите или удалите один.'],
  ['layout.error.POLYGON_SELF_INTERSECTION', 'Room edges cross. Adjust the corners.', '部屋の辺が交差しています。角の位置を調整してください。', 'Los lados de la habitación se cruzan. Ajusta las esquinas.', '방의 변이 교차합니다. 모서리를 조정해 주세요.', 'Стороны комнаты пересекаются. Измените углы.'],
  ['layout.error.POLYGON_ZERO_AREA', 'The room has no floor area. Spread its corners apart.', '部屋の面積がありません。角の位置を広げてください。', 'La habitación no tiene superficie. Separa las esquinas.', '방의 면적이 없습니다. 모서리를 벌려 주세요.', 'У комнаты нет площади. Разнесите углы.'],
  ['layout.warning.ROOM_OUT_OF_BOUNDS', 'An item extends outside the room.', '部屋の外にはみ出しているものがあります。', 'Un elemento sobresale de la habitación.', '방 밖으로 나와 있는 항목이 있습니다.', 'Объект выходит за пределы комнаты.'],
  ['layout.warning.SURFACE_OVERHANG', 'A printer extends beyond its desk or shelf.', 'プリンターが机や棚からはみ出しています。', 'Una impresora sobresale de su mesa o balda.', '프린터가 책상이나 선반 밖으로 나와 있습니다.', 'Принтер выступает за край стола или полки.'],
  ['layout.error.ROOM_OUT_OF_BOUNDS', 'Choose a position and size that fit inside the room.', '部屋の内側に収まる位置・サイズにしてください。', 'Elige una posición y un tamaño que quepan dentro de la habitación.', '방 안에 들어가는 위치와 크기로 설정해 주세요.', 'Выберите положение и размер, которые помещаются внутри комнаты.'],
  ['layout.error.SURFACE_OVERHANG', 'Keep the printer footprint within its desk or shelf.', 'プリンターが机や棚の天板に収まる位置・サイズにしてください。', 'Coloca la impresora de modo que su huella quepa en la mesa o balda.', '프린터가 책상이나 선반 위에 들어가는 위치와 크기로 설정해 주세요.', 'Расположите принтер так, чтобы его контур помещался на столе или полке.'],
  ['layout.warning.SHELF_BOARD_INTERSECTION', 'The space shown for a printer reaches a shelf board above it.', 'プリンターの表示範囲が上の棚板に届いています。', 'El espacio mostrado para una impresora alcanza una balda superior.', '프린터의 표시 영역이 위쪽 선반판에 닿습니다.', 'Показанное пространство принтера достигает полки сверху.'],
  ['layout.warning.ENVELOPE_OVERLAP', 'The space shown for two items overlaps.', '2つのものの表示範囲が重なっています。', 'El espacio mostrado para dos elementos se solapa.', '두 항목의 표시 영역이 겹칩니다.', 'Показанное пространство двух объектов пересекается.'],
);

rows.push(
  ['layout.planActions', 'Layout actions', 'レイアウトの操作', 'Acciones de distribución', '배치 작업', 'Действия с планировкой'],
  ['layout.undo', 'Undo', '元に戻す', 'Deshacer', '실행 취소', 'Отменить'],
  ['layout.redo', 'Redo', 'やり直す', 'Rehacer', '다시 실행', 'Повторить'],
  ['layout.add', 'Add to layout', '配置するものを追加', 'Añadir a la distribución', '배치할 항목 추가', 'Добавить объект'],
  ['layout.roomHelp', 'Set the room width, depth and wall height in millimetres.', '部屋の幅・奥行き・壁の高さをmmで設定できます。', 'Ajusta el ancho, el fondo y la altura de las paredes en milímetros.', '방 너비, 깊이, 벽 높이를 밀리미터로 설정하세요.', 'Задайте ширину, глубину и высоту стен в миллиметрах.'],
  ['layout.customRoomHelp', 'Enter one corner per line as X, Z in millimetres. Use at least 3 corners; do not repeat the first corner at the end. Choose Update room to use the shape.', '角の位置を1行ずつ、X, Zの順にmmで入力してください。角は3つ以上とし、最後に最初の角を繰り返さず、「部屋を更新」で反映できます。', 'Introduce una esquina por línea como X, Z en milímetros. Usa al menos 3 esquinas sin repetir la primera al final. Elige Actualizar habitación para usar la forma.', '한 줄에 모서리 하나씩 X, Z 순서로 밀리미터 값을 입력하세요. 모서리는 3개 이상 지정하고 마지막에 첫 모서리를 반복하지 마세요. 방 업데이트로 적용할 수 있습니다.', 'Введите каждый угол с новой строки как X, Z в миллиметрах. Нужно не менее 3 углов; первый угол в конце не повторяйте. Нажмите «Обновить комнату», чтобы применить форму.'],
  ['layout.render', 'Create image', '画像を作成', 'Crear imagen', '이미지 만들기', 'Создать изображение'],
  ['layout.finalRender', 'Layout image', 'レイアウトの画像', 'Imagen de la distribución', '배치 이미지', 'Изображение планировки'],
  ['layout.renderHelp', 'Create an image with the full printer models from your current view.', '現在の視点から、詳細なプリンターモデルを使った画像を作成します。', 'Crea una imagen desde la vista actual con los modelos completos de las impresoras.', '현재 시점에서 전체 프린터 모델로 이미지를 만듭니다.', 'Создайте изображение с текущего ракурса с полными моделями принтеров.'],
  ['layout.render.plan', 'Create plan image', '平面図を画像にする', 'Crear imagen del plano', '평면도 이미지 만들기', 'Создать изображение плана'],
  ['layout.render.planHelp', 'Save the flat plan as an image without loading full printer models.', '詳細なプリンターモデルを読み込まず、平面図を画像にします。', 'Guarda el plano como imagen sin cargar los modelos completos de las impresoras.', '상세 프린터 모델을 불러오지 않고 평면도를 이미지로 만듭니다.', 'Сохраните плоский план без загрузки полных моделей принтеров.'],
  ['layout.about', 'About this view', '表示について', 'Acerca de esta vista', '이 화면 안내', 'Об этом виде'],
  ['layout.scope', 'The preview uses simple shapes. Space checks use those shapes; leave room for moving parts, cables and access.', 'プレビューはシンプルな形で表示し、その範囲で配置を確認します。可動部・配線・作業に必要な余裕も確保してください。', 'La vista previa usa formas sencillas y comprueba ese espacio. Deja sitio para piezas móviles, cables y acceso.', '미리보기는 간단한 모양과 그 범위로 배치를 확인합니다. 움직이는 부품, 케이블, 작업 공간도 확보해 주세요.', 'В просмотре используются простые формы, по ним проверяется размещение. Оставьте место для движения, кабелей и доступа.'],
  ['layout.selectObject', 'Select item', '選択', 'Seleccionar elemento', '항목 선택', 'Выбрать объект'],
  ['layout.deskTop', '{name} · Desktop', '{name} · 天板', '{name} · Tablero', '{name} · 상판', '{name} · Столешница'],
  ['layout.shelfBoard', '{name} · Level {number}', '{name} · {number}段目', '{name} · Balda {number}', '{name} · {number}단', '{name} · Полка {number}'],
  ['layout.machineSize', 'Model: {width} × {depth} × {height} mm', 'モデル外寸：{width} × {depth} × {height} mm', 'Modelo: {width} × {depth} × {height} mm', '모델 외형: {width} × {depth} × {height} mm', 'Модель: {width} × {depth} × {height} мм'],
  ['layout.floorPosition', 'Position on floor', '床での位置', 'Posición en el suelo', '바닥 위 위치', 'Положение на полу'],
  ['layout.detachOnDelete', 'Move printers to the floor when removing this furniture', 'この家具を削除するとき、プリンターを床へ移す', 'Mover las impresoras al suelo al eliminar este mueble', '이 가구를 삭제할 때 프린터를 바닥으로 이동', 'При удалении мебели перенести принтеры на пол'],
  ['layout.placementWarning', 'Check the space around: {objects}', '周囲の空間を確認：{objects}', 'Revisa el espacio alrededor de: {objects}', '주변 공간 확인: {objects}', 'Проверьте пространство вокруг: {objects}'],
  ['layout.phase.download', 'Loading printer models…', 'プリンターモデルを読み込み中…', 'Cargando modelos de impresora…', '프린터 모델 불러오는 중…', 'Загрузка моделей принтеров…'],
  ['layout.phase.verify', 'Checking model files…', 'モデルファイルを確認中…', 'Comprobando archivos del modelo…', '모델 파일 확인 중…', 'Проверка файлов модели…'],
  ['layout.phase.decode', 'Preparing printer models…', 'プリンターモデルを準備中…', 'Preparando modelos de impresora…', '프린터 모델 준비 중…', 'Подготовка моделей принтеров…'],
  ['layout.phase.render', 'Creating image…', '画像を作成中…', 'Creando imagen…', '이미지 만드는 중…', 'Создание изображения…'],
  ['layout.phase.ready', 'Models ready', 'モデルの準備完了', 'Modelos listos', '모델 준비 완료', 'Модели готовы'],
);

rows.push(
  ['layout.desktopOnlyTitle', 'Supported on computers only', 'パソコンのみサポートしています', 'Solo compatible con ordenadores', 'PC에서만 지원합니다', 'Поддерживается только на компьютерах'],
  ['layout.desktopOnlyText', 'This planner has not been tested on phones.', 'スマホでの動作は確認していません。', 'Este planificador no se ha probado en móviles.', '스마트폰에서의 작동은 확인하지 않았습니다.', 'Работа планировщика на смартфонах не проверялась.'],
  ['layout.openViewer', 'Open printer viewer', 'プリンターを見る', 'Abrir visor de impresoras', '프린터 뷰어 열기', 'Открыть просмотр принтеров'],
);

rows.push(
  ['layout.roomDraftHelp', 'Choose a shape and apply its room dimensions. Placed items keep their positions.', '部屋の形と寸法を選び、更新してください。配置したものの位置は変わりません。', 'Elige una forma y aplica sus medidas. Los objetos conservan su posición.', '방 모양과 치수를 선택해 적용하세요. 배치한 항목의 위치는 유지됩니다.', 'Выберите форму и примените размеры комнаты. Объекты останутся на своих местах.'],
  ['layout.error.RENDER_UNSUPPORTED', 'This browser cannot create the image. The layout is still available.', 'このブラウザーでは画像を作成できません。レイアウトの作成は引き続き利用できます。', 'Este navegador no puede crear la imagen. Puedes seguir usando la distribución.', '이 브라우저에서는 이미지를 만들 수 없습니다. 배치는 계속 이용할 수 있습니다.', 'Этот браузер не может создать изображение. Планировка по-прежнему доступна.'],
  ['layout.error.RENDER_SHADER_FAILED', 'The image could not be drawn. Try updating your browser.', '画像を描画できませんでした。ブラウザーを更新して再試行してください。', 'No se pudo dibujar la imagen. Prueba a actualizar el navegador.', '이미지를 그리지 못했습니다. 브라우저를 업데이트한 뒤 다시 시도해 주세요.', 'Не удалось отрисовать изображение. Попробуйте обновить браузер.'],
);

rows.push(
  ['layout.roomEditor.title', 'Edit room outline', '部屋の輪郭を編集', 'Editar contorno de la habitación', '방 윤곽 편집', 'Изменить контур комнаты'],
  ['layout.roomEditor.intro', 'Click a corner to select or drag it. Choose New outline, then click to add corners. Click the first corner or press Enter to close the outline.', '角をクリックして選択し、ドラッグで移動できます。「新しい輪郭」を選び、クリックして角を追加してください。最初の角をクリックするかEnterキーを押すと輪郭を閉じられます。', 'Haz clic en una esquina para seleccionarla o arrastrarla. Elige Nuevo contorno y haz clic para añadir esquinas. Haz clic en la primera esquina o pulsa Intro para cerrar el contorno.', '모서리를 클릭해 선택하고 드래그해 이동하세요. 새 윤곽을 선택한 뒤 클릭해 모서리를 추가하세요. 첫 모서리를 클릭하거나 Enter를 누르면 윤곽이 닫힙니다.', 'Нажмите на угол, чтобы выбрать или перетащить его. Выберите «Новый контур», затем добавляйте углы щелчками. Нажмите на первый угол или Enter, чтобы замкнуть контур.'],
  ['layout.roomEditor.move', 'Move corners', '角を移動', 'Mover esquinas', '모서리 이동', 'Переместить углы'],
  ['layout.roomEditor.add', 'Add corner', '角を追加', 'Añadir esquina', '모서리 추가', 'Добавить угол'],
  ['layout.roomEditor.pan', 'Move view', '表示を移動', 'Mover vista', '화면 이동', 'Переместить вид'],
  ['layout.roomEditor.new', 'New outline', '新しい輪郭', 'Nuevo contorno', '새 윤곽', 'Новый контур'],
  ['layout.roomEditor.width', 'Outline width / mm', '輪郭の幅 / mm', 'Ancho del contorno / mm', '윤곽 너비 / mm', 'Ширина контура / мм'],
  ['layout.roomEditor.x', 'Corner X / mm', '角のX / mm', 'X de la esquina / mm', '모서리 X / mm', 'Координата X угла / мм'],
  ['layout.roomEditor.z', 'Corner Z / mm', '角のZ / mm', 'Z de la esquina / mm', '모서리 Z / mm', 'Координата Z угла / мм'],
  ['layout.roomEditor.remove', 'Remove corner', '角を削除', 'Eliminar esquina', '모서리 삭제', 'Удалить угол'],
  ['layout.roomEditor.minimum', 'Keep at least 3 corners.', '角は3つ以上残してください。', 'Mantén al menos 3 esquinas.', '모서리를 3개 이상 남겨 주세요.', 'Оставьте не менее 3 углов.'],
  ['layout.roomEditor.canvas', 'Room outline editor', '部屋の輪郭エディター', 'Editor del contorno de la habitación', '방 윤곽 편집 화면', 'Редактор контура комнаты'],
  ['layout.roomEditor.svgScale', 'Set the real outline width before applying. SVG paper or pixel units are not room dimensions.', '反映する前に、輪郭の実際の幅を設定してください。SVGの用紙やピクセルの単位は、部屋の実寸ではありません。', 'Indica el ancho real del contorno antes de aplicarlo. Las unidades de papel o píxeles del SVG no son las dimensiones de la habitación.', '적용하기 전에 윤곽의 실제 너비를 설정하세요. SVG의 용지나 픽셀 단위는 방의 실제 치수가 아닙니다.', 'Перед применением задайте реальную ширину контура. Единицы листа или пиксели SVG не являются размерами комнаты.'],
  ['layout.roomEditor.keys', 'Wheel: zoom · Select a corner to move or remove it.', 'ホイールで拡大・縮小 · 角を選ぶと移動や削除ができます。', 'Rueda: acercar o alejar · Selecciona una esquina para moverla o eliminarla.', '휠: 확대·축소 · 모서리를 선택해 이동하거나 삭제하세요.', 'Колесо: масштаб · Выберите угол для перемещения или удаления.'],
  ['layout.roomEditor.scaleError', 'Enter an outline width from 30 to 100000 mm.', '輪郭の幅は30〜100000 mmで入力してください。', 'Introduce un ancho de contorno entre 30 y 100000 mm.', '윤곽 너비를 30~100000 mm로 입력해 주세요.', 'Введите ширину контура от 30 до 100000 мм.'],
  ['layout.roomEditor.approximate', 'This outline was simplified. Check the corners and dimensions.', 'この輪郭は簡略化されています。角の位置と寸法を確認してください。', 'Este contorno se ha simplificado. Revisa las esquinas y las dimensiones.', '이 윤곽은 단순화되었습니다. 모서리와 치수를 확인해 주세요.', 'Этот контур был упрощён. Проверьте углы и размеры.'],
  ['layout.roomEditor.outline', 'Outline', '輪郭', 'Contorno', '윤곽', 'Контур'],
  ['layout.roomEditor.maximum', 'Use up to 32 corners.', '角は32個まで追加できます。', 'Usa hasta 32 esquinas.', '모서리는 최대 32개까지 사용할 수 있습니다.', 'Используйте не более 32 углов.'],
  ['layout.roomEditor.fit', 'Show whole outline', '輪郭全体を表示', 'Ver todo el contorno', '전체 윤곽 보기', 'Показать весь контур'],
  ['layout.roomEditor.apply', 'Use outline', 'この輪郭を使う', 'Usar contorno', '이 윤곽 사용', 'Применить контур'],
  ['layout.roomEditor.invalid', 'Check the outline. Use at least 3 corners with no crossing edges.', '輪郭を確認してください。辺が交差しないように、角を3つ以上設定してください。', 'Revisa el contorno. Usa al menos 3 esquinas sin lados que se crucen.', '윤곽을 확인하세요. 변이 교차하지 않도록 모서리를 3개 이상 지정해 주세요.', 'Проверьте контур. Нужно не менее 3 углов без пересекающихся сторон.'],
  ['layout.error.SVG_NO_OUTLINE', 'No closed outline was found in this SVG. Choose another file.', 'このSVGに閉じた輪郭が見つかりませんでした。別のファイルを選んでください。', 'No se encontró un contorno cerrado en este SVG. Elige otro archivo.', '이 SVG에서 닫힌 윤곽을 찾지 못했습니다. 다른 파일을 선택해 주세요.', 'В этом SVG не найден замкнутый контур. Выберите другой файл.'],
  ['layout.openPrinterSources', 'Open printer / sources', 'プリンター・出典を開く', 'Abrir impresora / fuentes', '프린터 / 출처 열기', 'Открыть принтер / источники'],
  ['layout.editRoomOutline', 'Edit outline', '輪郭を編集', 'Editar contorno', '윤곽 편집', 'Изменить контур'],
  ['layout.importFloorplanSVG', 'Import SVG', 'SVGを読み込む', 'Importar SVG', 'SVG 가져오기', 'Импорт SVG'],
);

rows.push(
  ['layout.warning.ROOM_HEIGHT_EXCEEDED', 'This item extends above the room height.', '部屋の高さを超えています。', 'Este elemento supera la altura de la habitación.', '이 항목이 방의 높이를 넘습니다.', 'Этот объект выступает выше заданной высоты комнаты.'],
);

rows.push(
  ['layout.roomEditor.confirmScale', 'I have checked the real outline width.', '輪郭の実際の幅を確認しました。', 'He comprobado el ancho real del contorno.', '윤곽의 실제 너비를 확인했습니다.', 'Я проверил(а) реальную ширину контура.'],
);

rows.push(
  ['layout.roomEditor.separateOutlines', 'Closed outlines are imported separately. Holes are not included.', '閉じた輪郭は別々に読み込まれます。穴は反映されません。', 'Los contornos cerrados se importan por separado. Los huecos no se incluyen.', '닫힌 윤곽은 각각 따로 가져옵니다. 구멍은 포함되지 않습니다.', 'Замкнутые контуры импортируются отдельно. Отверстия не учитываются.'],
);

const aliases = {
  'layout.issue.ROOM_HEIGHT_EXCEEDED': 'layout.warning.ROOM_HEIGHT_EXCEEDED',
  'layout.roomEditor.undo': 'layout.undo', 'layout.roomEditor.redo': 'layout.redo',
  'layout.customPointsHelp': 'layout.customRoomHelp',
  'layout.machines': 'nav.machines', 'layout.language': 'common.language', 'layout.navigation': 'nav.workspace',
  'layout.sceneLabel': 'layout.canvas', 'sceneLabel': 'layout.canvas', 'layout.interactiveScene': 'layout.canvas',
  'layout.settings': 'layout.controls', 'layout.orbit': 'layout.tool.orbit', 'layout.move': 'layout.tool.move',
  'layout.topView': 'layout.top_view', 'layout.frontView': 'layout.front_view', 'layout.fit': 'layout.fit_view',
  'layout.view.perspective': 'layout.perspective', 'layout.view.top': 'layout.top_view',
  'layout.view.front': 'layout.front_view', 'layout.view.fit': 'layout.fit_view',
  'layout.sceneHint': 'layout.hint.move', 'layout.saved': 'common.saved',
  'layout.error.FILE_TOO_LARGE': 'layout.file_too_large', 'layout.error.JSON_SIZE_LIMIT': 'layout.file_too_large',
  'layout.error.JSON_PARSE_ERROR': 'layout.load_error', 'layout.error.VERSION_UNSUPPORTED': 'layout.unsupported_version',
  'layout.error.UNKNOWN_MACHINE': 'layout.unknown_machine', 'layout.error.UNKNOWN_SURFACE': 'layout.invalid_surface',
  'layout.error.PARENT_OCCUPIED': 'layout.remove_occupied',
  'layout.error.INVALID_ACTION': 'layout.change_rejected', 'layout.error.UNKNOWN_ACTION': 'layout.change_rejected',
  'layout.error.SIMPLE_POLYGON_TRIANGULATION_FAILED': 'layout.invalid_room',
  'layout.actionFailed': 'layout.change_rejected', 'layout.import': 'layout.load', 'layout.exportPlan': 'layout.save',
  'layout.reset': 'common.reset', 'layout.width': 'common.width', 'layout.depth': 'common.depth',
  'layout.height': 'common.height', 'layout.thickness': 'common.thickness',
  'layout.validNumber': 'layout.invalid_number', 'layout.addDesk': 'layout.add_desk', 'layout.addShelf': 'layout.add_shelf',
  'layout.addPrinter': 'layout.add_printer', 'layout.searchPrinters': 'layout.search_printers',
  'layout.choosePrinter': 'layout.choose_printer', 'layout.noPrinters': 'layout.no_printers',
  'layout.objects': 'layout.items', 'layout.selection': 'layout.selected',
  'layout.cancel': 'common.cancel', 'layout.deskName': 'layout.desk_name', 'layout.shelfName': 'layout.shelf_name',
  'layout.selectHint': 'layout.nothing_selected', 'layout.support': 'layout.place_on',
  'layout.supportHelp': 'layout.follows_furniture', 'layout.surfacePosition': 'layout.local_position',
  'layout.positionX': 'layout.position_x', 'layout.positionZ': 'layout.position_z',
  'layout.rotateLeft': 'layout.rotate_left', 'layout.rotateRight': 'layout.rotate_right',
  'layout.boards': 'layout.levels', 'layout.boardNumber': 'layout.level', 'layout.boardHeight': 'layout.level_height',
  'layout.removeBoard': 'layout.remove_level', 'layout.addBoard': 'layout.add_level',
  'layout.duplicate': 'common.duplicate', 'layout.delete': 'common.remove', 'layout.rendering': 'layout.phase.render',
  'layout.issue.ROOM_OUT_OF_BOUNDS': 'layout.warning.ROOM_OUT_OF_BOUNDS',
  'layout.issue.SURFACE_OVERHANG': 'layout.warning.SURFACE_OVERHANG',
  'layout.issue.SHELF_BOARD_INTERSECTION': 'layout.warning.SHELF_BOARD_INTERSECTION',
  'layout.issue.ENVELOPE_OVERLAP': 'layout.warning.ENVELOPE_OVERLAP',
  'layout.phase.fetch': 'layout.phase.download', 'layout.phase.assembly': 'layout.phase.decode',
  'layout.phase.complete': 'layout.phase.ready', 'layout.phase.manifest': 'layout.phase.verify',
};
for (const [alias, original] of Object.entries(aliases)) {
  const row = rows.find(([id]) => id === original);
  if (!row) throw new Error('Missing layout alias source');
  rows.push([alias, ...row.slice(1)]);
}

const dictionaries = Object.fromEntries(supportedLanguages.map((language, index) => [language,
  Object.freeze(Object.fromEntries(rows.map(([id, ...texts]) => [id, texts[index]])))
]));
export const messages = Object.freeze(dictionaries);
export const messageKeys = Object.freeze(rows.map(([id]) => id));
export const hasMessage = key => Object.hasOwn(messages.en, key);

export function t(key, values = {}, language = 'en') {
  const dictionary = messages[normalizeLanguage(language) || 'en'];
  if (!Object.hasOwn(dictionary, key)) {
    // Unexpected runtime error codes remain readable; ordinary missing UI keys fail loudly in tests.
    if (typeof key === 'string' && key.startsWith('layout.error.')) return dictionary['layout.error.generic'];
    throw new RangeError('Unknown layout message: ' + key);
  }
  return dictionary[key].replace(/\{([a-zA-Z0-9_]+)\}/gu, (_, name) => {
    if (values == null || !Object.hasOwn(values, name)) throw new TypeError('Missing layout message value: ' + name);
    return String(values[name]);
  });
}
export function createLayoutTranslator(language = 'en') {
  const selected = normalizeLanguage(language) || 'en';
  return (key, values = {}) => t(key, values, selected);
}
export function formatNumber(value, language = 'en', options = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Expected finite number');
  return new Intl.NumberFormat(normalizeLanguage(language) || 'en', {maximumFractionDigits: 2, ...options}).format(value);
}
