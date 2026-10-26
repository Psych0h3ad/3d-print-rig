// Concise display notices; detailed source terms remain in References.
const notices={
 en:['Rear latches are shown fitted; their bending is not simulated.','Spacers are based on Fanta_r’s model and shortened for display.','The bed thermistor and internal wiring are not fully modeled.'],
 ja:['背面ラッチは装着した状態で表示します。曲がりはシミュレーションしていません。','スペーサーはFanta_rのモデルを基に、表示用に短くしています。','ベッドのサーミスターと内部配線は完全にはモデル化されていません。'],
 de:['Die hinteren Riegel werden eingebaut dargestellt; ihre Biegung wird nicht simuliert.','Die Abstandhalter basieren auf dem Modell von Fanta_r und sind für die Darstellung gekürzt.','Bettthermistor und interne Verkabelung sind nicht vollständig modelliert.'],
 es:['Los pestillos traseros se muestran montados; no se simula su flexión.','Los separadores se basan en el modelo de Fanta_r y se han acortado para mostrarlos.','El termistor de la cama y el cableado interno no están completamente modelados.'],
 ko:['뒤쪽 래치는 장착된 상태로 표시되며 휘어짐은 시뮬레이션하지 않습니다.','스페이서는 Fanta_r 모델을 바탕으로 표시용으로 짧게 만들었습니다.','베드 서미스터와 내부 배선은 완전히 모델링되지 않았습니다.'],
 ru:['Задние защёлки показаны установленными; их изгиб не моделируется.','Проставки основаны на модели Fanta_r и укорочены для отображения.','Термистор стола и внутренняя проводка смоделированы не полностью.']
};
const labels={en:'Source colors',ja:'元の色',de:'Originalfarben',es:'Colores originales',ko:'원본 색상',ru:'Исходные цвета'};
const probeReview={
 en:'Probe fastener fit is under review.',ja:'プローブ固定ねじの適合は確認中です。',
 de:'Die Passung der Sensorbefestigung wird geprüft.',es:'El ajuste de los tornillos de la sonda está en revisión.',
 ko:'프로브 고정 나사의 결합을 검토 중입니다.',ru:'Посадка крепежа датчика проверяется.'
};
const boardOmitted={
 en:'Controller board geometry is omitted.',ja:'コントローラーボードの形状は省略しています。',
 de:'Die Geometrie der Steuerplatine ist nicht enthalten.',es:'Se omite la geometría de la placa controladora.',
 ko:'컨트롤러 보드 형상은 생략되었습니다.',ru:'Геометрия платы контроллера не показана.'
};
export const isBoardOmittedSource=packet=>packet?.model?.sha256==='1dad2900f881eec60fa16255c98628489443ea453086c79b7d0d6ac0e3e6bf3f'&&packet?.inventory?.sha256==='1fb17bae60800458c27ba5ffcd57d4987508f0fda5cec757cade3af60ef7fcca'&&packet.parts?.length===508&&!packet.parts.some(r=>r.key==='BTT-original-full-controller-with-five-source-hole-derivative');
export const e3ngSourceNotices=(language,packet=null)=>[...(notices[language]??notices.en),...(isBoardOmittedSource(packet)?[probeReview[language]??probeReview.en,boardOmitted[language]??boardOmitted.en]:[])];
export function sourceReferenceNoticeKeys(packet){
 const omitted=isBoardOmittedSource(packet);
 return [...new Set([...(packet.public_notices??[]).filter(k=>!k.startsWith('stl-')&&k!=='sourceBounds'),...(packet.public_reference_notes??[])])].filter(k=>!omitted||!['controllerBores','physicalColorNote','incompleteE3'].includes(k));
}
export const sourceColorLabel=language=>labels[language]??labels.en;
