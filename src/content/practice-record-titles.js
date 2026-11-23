(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.practiceRecordTitles) return;
  const merchant = "https://app5qnhc4gj6683.pc.xiaoe-tech.com";
  // Directory metadata only: stable exercise IDs, parent heading or chapter
  // number. Never match duplicate generic titles by their text alone.
  // Parent titles from course_3CTGpVzwZkCzA3vMxa5maGZr9Mb.
  const foundation = [
    ["wb_course_69e37a33314a0_VGg5WErU", "【基础先行】语法基础-第1讲 形容词"],
    ["wb_course_69edfab69b207_BKvubkfk", "【基础先行】语法基础-第2讲 动词"],
    ["wb_course_69f6a610655ac_EtMDhNyb", "【基础先行】语法基础-第3讲 被动、使役、使役被动"],
    ["wb_course_6a004ffa16264_oKS46nO3", "【基础先行】语法基础-第4讲 自动词和他动词"],
    ["wb_course_6a091babed7c5_dtIMX1h9", "【基础先行】语法基础-第5讲 授受表达"],
    ["wb_course_6a131fa7c620f_atG8USQK", "【基础先行】语法基础-第6讲 日语句子的构造"],
    ["wb_course_6a1c42e15d0b4_u40oFLll", "【基础先行】语法基础-第7讲 时态和体态"],
    ["wb_course_6a1c4345c9232_XU0I6IA0", "【基础先行】语法基础-第8讲 语体"],
    ["wb_course_6a257fbdf3465_MSpmXdeS", "【基础先行】语法基础-第9讲 敬语"],
    ["wb_course_6a257ff4bc978_TJWoBvwh", "【基础先行】语法基础-第10讲 难点句型辨析"],
    ["wb_course_6a25803212235_V7CEFRoe", "【基础先行】语法基础-综合练习"],
  ];
  // Exercise numbers from the 语法专项 chapter of course_3CTGydteyamnj5kL76jhlUkwdsm.
  const specialty = [
    ["wb_course_6a53a10967d7d_ugHhdlfq", 1],
    ["wb_course_6a53a11d7d1b7_U1XElTLA", 2],
    ["wb_course_6a5cf7f2ed543_WQnEZoQL", 3],
    ["wb_course_6a5cf809316b1_rUFeMoZy", 4],
    ["wb_course_6a662b901118b_XSoH4DU2", 5],
    ["wb_course_6a662ba4a47ae_OA8mjK0Q", 6],
    ["wb_course_6a6fece90826d_WvxZEqIJ", 7],
    ["wb_course_6a6fed0136078_z1CwvQ4c", 8],
    ["wb_course_6a78975c9ee04_EN3W2hUx", 9],
    ["wb_course_6a789773cbc5c_JpIwfeB9", 10],
  ];
  const index = new Map([
    ...foundation.map(([id, parent]) => [id, parent.replace(/^【基础先行】\s*/, "")]),
    ...specialty.map(([id, number]) => [id, `语法专项${number}`]),
  ]);
  function create(origin, titles = origin === merchant ? index : new Map()) {
    const changed = new Map();
    const resolve = row => titles.get(row?.resourceId || row?.sourceId) || "";
    function restore(node, previous) {
      if (node.isConnected && node.data === previous.applied) node.data = previous.original;
    }
    function clear() {
      for (const [node, previous] of changed) restore(node, previous);
      changed.clear();
    }
    function render(root, rows) {
      if (!root || !Array.isArray(rows)) { clear(); return; }
      const touched = new Set();
      for (const card of root.querySelectorAll(".resource-card[data-xet-history-row]")) {
        const rowIndex = card.getAttribute("data-xet-history-row");
        if (!/^\d+$/.test(rowIndex || "")) continue;
        const next = resolve(rows[Number(rowIndex)]);
        if (!next) continue;
        const target = card.querySelector(".resource-card__title");
        // The native ResourceCard renders a single text node. Don't replace
        // the title container (or a future richer card) or disturb its link.
        if (target?.childNodes.length !== 1 || target.firstChild.nodeType !== 3) continue;
        const node = target.firstChild;
        let previous = changed.get(node);
        if (!previous || node.data !== previous.applied) previous = { original: node.data, applied: next };
        previous.applied = next; touched.add(node); changed.set(node, previous);
        if (node.data !== next) node.data = next;
      }
      for (const [node, previous] of changed) if (!touched.has(node)) { restore(node, previous); changed.delete(node); }
    }
    return Object.freeze({ resolve, render, clear });
  }
  modules.practiceRecordTitles = Object.freeze({ create });
})();
