import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { supabase } from "./lib/supabase";

function toDateLabel(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("ja-JP");
}

async function fetchItems() {
  const { data, error } = await supabase
    .from("purchase_items")
    .select("*")
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

async function uploadImage(file) {
  const ext = file.name.split(".").pop() || "jpg";
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const filePath = `items/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("purchase-images")
    .upload(filePath, file, { upsert: false });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from("purchase-images")
    .getPublicUrl(filePath);

  return data.publicUrl;
}

function App() {
  const [items, setItems] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [editingId, setEditingId] = useState(null);

  const [productName, setProductName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [comment, setComment] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [imageFileName, setImageFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef(null);

  const loadItems = async () => {
    try {
      setLoading(true);
      const rows = await fetchItems();
      setItems(rows);
    } catch (error) {
      console.error(error);
      alert("データの読み込みに失敗しました。Supabase設定を確認してください。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      return (
        (item.product_name || "").toLowerCase().includes(q) ||
        (item.comment || "").toLowerCase().includes(q)
      );
    });
  }, [items, searchText]);

  const resetForm = () => {
    setEditingId(null);
    setProductName("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setComment("");
    setImagePreviewUrl("");
    setImageFileName("");
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setImageFileName(file.name);

    const previewUrl = URL.createObjectURL(file);
    setImagePreviewUrl(previewUrl);
  };

  const handleSave = async () => {
    if (!productName.trim()) {
      alert("製品名を入力してください");
      return;
    }

    try {
      setSaving(true);

      let imageUrl = "";

      if (selectedFile) {
        imageUrl = await uploadImage(selectedFile);
      } else if (editingId) {
        const current = items.find((item) => item.id === editingId);
        imageUrl = current?.image_url || "";
      }

      const payload = {
        product_name: productName.trim(),
        purchase_date: purchaseDate,
        comment: comment.slice(0, 100),
        image_url: imageUrl,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await supabase
          .from("purchase_items")
          .update(payload)
          .eq("id", editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("purchase_items").insert(payload);
        if (error) throw error;
      }

      await loadItems();
      resetForm();
    } catch (error) {
      console.error(error);
      alert("保存に失敗しました。StorageやDB設定を確認してください。");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setProductName(item.product_name || "");
    setPurchaseDate(item.purchase_date || new Date().toISOString().slice(0, 10));
    setComment(item.comment || "");
    setImagePreviewUrl(item.image_url || "");
    setImageFileName(item.image_url ? "登録済み画像" : "");
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("この履歴を削除しますか？")) return;

    try {
      const { error } = await supabase.from("purchase_items").delete().eq("id", id);
      if (error) throw error;

      await loadItems();

      if (editingId === id) {
        resetForm();
      }
    } catch (error) {
      console.error(error);
      alert("削除に失敗しました。");
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>買い物記録アプリ</h1>
          <p>商品画像アップロード対応のシンプルなWebアプリ</p>
        </div>
      </header>

      <section className="panel">
        <h2>{editingId ? "履歴を編集" : "新規登録"}</h2>

        <div className="field">
          <label>商品画像</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageChange}
          />
          {imageFileName && <p className="subtext">選択中: {imageFileName}</p>}
          {imagePreviewUrl && (
            <img className="preview" src={imagePreviewUrl} alt="preview" />
          )}
        </div>

        <div className="field">
          <label>製品名</label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="例: Apple Pencil Pro"
          />
        </div>

        <div className="field">
          <label>購入日</label>
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
          />
        </div>

        <div className="field">
          <label>コメント（100文字まで）</label>
          <textarea
            rows="4"
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 100))}
            placeholder="購入メモを入力"
          />
          <p className="subtext">{comment.length}/100</p>
        </div>

        <div className="actions">
          <button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : editingId ? "更新する" : "保存する"}
          </button>
          <button type="button" className="secondary" onClick={resetForm}>
            クリア
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>検索</h2>
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="製品名・コメントで検索"
        />
      </section>

      <section className="panel">
        <h2>履歴一覧</h2>

        {loading ? (
          <p className="empty">読み込み中...</p>
        ) : filteredItems.length === 0 ? (
          <p className="empty">履歴がありません</p>
        ) : (
          <div className="grid">
            {filteredItems.map((item) => (
              <article key={item.id} className="card">
                <div className="imageWrap">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.product_name} />
                  ) : (
                    <div className="noImage">画像なし</div>
                  )}
                </div>

                <div className="cardBody">
                  <h3>{item.product_name}</h3>
                  <p className="date">購入日: {toDateLabel(item.purchase_date)}</p>
                  <p className="comment">{item.comment || "コメントなし"}</p>

                  <div className="actions">
                    <button type="button" onClick={() => handleEdit(item)}>
                      編集
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => handleDelete(item.id)}
                    >
                      削除
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;