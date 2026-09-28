from flask import Flask, request, jsonify, session, send_from_directory
from flask_cors import CORS
from database import get_supabase, init_db, hash_password, verify_password
from functools import wraps

app = Flask(__name__, static_folder='static')
app.secret_key = 'your-secret-key-change-in-production'
CORS(app, supports_credentials=True)

# Инициализация БД при запуске
try:
    init_db()
    print("✓ База данных инициализирована")
except Exception as e:
    print(f"⚠ Предупреждение при инициализации БД: {str(e)}")
    print("Убедитесь, что таблицы созданы в Supabase через SQL Editor")

@app.route('/')
def index():
    """Главная страница"""
    return send_from_directory('.', 'index.html')

def login_required(f):
    """Декоратор для проверки авторизации"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Требуется авторизация'}), 401
        return f(*args, **kwargs)
    return decorated_function

@app.route('/api/register', methods=['POST'])
def register():
    """Регистрация пользователя"""
    data = request.json
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    
    if not username or not email or not password:
        return jsonify({'error': 'Все поля обязательны'}), 400
    
    supabase = get_supabase()
    
    try:
        password_hash = hash_password(password)
        
        # Проверяем, существует ли пользователь
        existing_username = supabase.table('users').select('id').eq('username', username).execute()
        existing_email = supabase.table('users').select('id').eq('email', email).execute()
        
        if existing_username.data or existing_email.data:
            return jsonify({'error': 'Пользователь с таким именем или email уже существует'}), 400
        
        # Создаем нового пользователя
        result = supabase.table('users').insert({
            'username': username,
            'email': email,
            'password_hash': password_hash
        }).execute()
        
        if result.data:
            user_id = result.data[0]['id']
            session['user_id'] = user_id
            session['username'] = username
            return jsonify({'message': 'Регистрация успешна', 'user_id': user_id}), 201
        else:
            return jsonify({'error': 'Ошибка регистрации'}), 500
    except Exception as e:
        print(f"Ошибка регистрации: {str(e)}")  # Логирование для отладки
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Ошибка регистрации: {str(e)}'}), 500

@app.route('/api/login', methods=['POST'])
def login():
    """Вход пользователя"""
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Имя пользователя и пароль обязательны'}), 400
    
    supabase = get_supabase()
    
    try:
        result = supabase.table('users').select('id, username, password_hash').eq('username', username).execute()
        
        if result.data and len(result.data) > 0:
            user = result.data[0]
            if verify_password(password, user['password_hash']):
                session['user_id'] = user['id']
                session['username'] = user['username']
                return jsonify({'message': 'Вход выполнен', 'user_id': user['id'], 'username': user['username']}), 200
        
        return jsonify({'error': 'Неверное имя пользователя или пароль'}), 401
    except Exception as e:
        print(f"Ошибка входа: {str(e)}")  # Логирование для отладки
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Ошибка входа: {str(e)}'}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    """Выход пользователя"""
    session.clear()
    return jsonify({'message': 'Выход выполнен'}), 200

@app.route('/api/user', methods=['GET'])
@login_required
def get_user():
    """Получение информации о текущем пользователе"""
    return jsonify({
        'user_id': session['user_id'],
        'username': session['username']
    }), 200

@app.route('/api/games', methods=['GET'])
def get_games():
    """Получение списка всех игр (справочник)"""
    supabase = get_supabase()
    
    try:
        # Получаем игры
        games_result = supabase.table('games').select('id, title, developer, publisher, release_year, description, genre_id').execute()
        
        # Получаем все жанры для маппинга
        genres_result = supabase.table('genres').select('id, name').execute()
        genre_map = {g['id']: g['name'] for g in genres_result.data}
        
        games = []
        for game in games_result.data:
            genre_id = game.get('genre_id')
            genre_name = genre_map.get(genre_id) if genre_id else None
            
            games.append({
                'id': game['id'],
                'title': game['title'],
                'developer': game.get('developer'),
                'publisher': game.get('publisher'),
                'release_year': game.get('release_year'),
                'description': game.get('description'),
                'genre': genre_name
            })
        
        # Сортируем по названию
        games.sort(key=lambda x: x['title'])
        return jsonify(games), 200
    except Exception as e:
        return jsonify({'error': f'Ошибка загрузки игр: {str(e)}'}), 500

@app.route('/api/genres', methods=['GET'])
def get_genres():
    """Получение списка жанров"""
    supabase = get_supabase()
    
    try:
        result = supabase.table('genres').select('id, name').order('name').execute()
        return jsonify(result.data), 200
    except Exception as e:
        return jsonify({'error': f'Ошибка загрузки жанров: {str(e)}'}), 500

@app.route('/api/my-games', methods=['GET'])
@login_required
def get_my_games():
    """Получение коллекции игр пользователя"""
    user_id = session['user_id']
    supabase = get_supabase()
    
    try:
        # Получаем коллекцию пользователя
        user_games_result = supabase.table('user_games').select(
            'id, game_id, hours_played, status, added_at'
        ).eq('user_id', user_id).order('added_at', desc=True).execute()
        
        if not user_games_result.data:
            return jsonify([]), 200
        
        # Получаем ID всех игр
        game_ids = [item['game_id'] for item in user_games_result.data]
        
        if not game_ids:
            return jsonify([]), 200
        
        # Получаем информацию об играх
        games_result = supabase.table('games').select('id, title, developer, publisher, release_year, description, genre_id').in_('id', game_ids).execute()
        
        # Получаем жанры
        genres_result = supabase.table('genres').select('id, name').execute()
        genre_map = {g['id']: g['name'] for g in genres_result.data}
        
        # Создаем маппинг игр
        games_map = {g['id']: g for g in games_result.data}
        
        games = []
        for item in user_games_result.data:
            game_data = games_map.get(item['game_id'], {})
            genre_id = game_data.get('genre_id')
            genre_name = genre_map.get(genre_id) if genre_id else None
            
            games.append({
                'id': item['id'],
                'game_id': item['game_id'],
                'hours_played': item.get('hours_played', 0),
                'status': item.get('status', 'owned'),
                'added_at': item.get('added_at'),
                'title': game_data.get('title'),
                'developer': game_data.get('developer'),
                'publisher': game_data.get('publisher'),
                'release_year': game_data.get('release_year'),
                'description': game_data.get('description'),
                'genre': genre_name
            })
        
        return jsonify(games), 200
    except Exception as e:
        return jsonify({'error': f'Ошибка загрузки коллекции: {str(e)}'}), 500

@app.route('/api/my-games', methods=['POST'])
@login_required
def add_game_to_collection():
    """Добавление игры в коллекцию"""
    user_id = session['user_id']
    data = request.json
    game_id = data.get('game_id')
    hours_played = data.get('hours_played', 0)
    status = data.get('status', 'owned')
    
    if not game_id:
        return jsonify({'error': 'ID игры обязателен'}), 400
    
    supabase = get_supabase()
    
    try:
        # Проверяем, есть ли уже эта игра в коллекции
        existing = supabase.table('user_games').select('id').eq('user_id', user_id).eq('game_id', game_id).execute()
        if existing.data:
            return jsonify({'error': 'Игра уже в коллекции'}), 400
        
        result = supabase.table('user_games').insert({
            'user_id': user_id,
            'game_id': game_id,
            'hours_played': hours_played,
            'status': status
        }).execute()
        
        if result.data:
            return jsonify({'message': 'Игра добавлена в коллекцию'}), 201
        else:
            return jsonify({'error': 'Ошибка добавления игры'}), 500
    except Exception as e:
        return jsonify({'error': f'Ошибка добавления: {str(e)}'}), 500

@app.route('/api/my-games/<int:game_id>', methods=['PUT'])
@login_required
def update_game_in_collection(game_id):
    """Обновление информации об игре в коллекции"""
    user_id = session['user_id']
    data = request.json
    hours_played = data.get('hours_played')
    status = data.get('status')
    
    supabase = get_supabase()
    
    updates = {}
    if hours_played is not None:
        updates['hours_played'] = hours_played
    if status is not None:
        updates['status'] = status
    
    if not updates:
        return jsonify({'error': 'Нет данных для обновления'}), 400
    
    try:
        result = supabase.table('user_games').update(updates).eq('user_id', user_id).eq('game_id', game_id).execute()
        
        if result.data:
            return jsonify({'message': 'Информация обновлена'}), 200
        else:
            return jsonify({'error': 'Игра не найдена в коллекции'}), 404
    except Exception as e:
        return jsonify({'error': f'Ошибка обновления: {str(e)}'}), 500

@app.route('/api/my-games/<int:game_id>', methods=['DELETE'])
@login_required
def remove_game_from_collection(game_id):
    """Удаление игры из коллекции"""
    user_id = session['user_id']
    supabase = get_supabase()
    
    try:
        result = supabase.table('user_games').delete().eq('user_id', user_id).eq('game_id', game_id).execute()
        
        if result.data:
            return jsonify({'message': 'Игра удалена из коллекции'}), 200
        else:
            return jsonify({'error': 'Игра не найдена в коллекции'}), 404
    except Exception as e:
        return jsonify({'error': f'Ошибка удаления: {str(e)}'}), 500

@app.route('/api/statistics', methods=['GET'])
@login_required
def get_statistics():
    """Получение статистики пользователя"""
    user_id = session['user_id']
    supabase = get_supabase()
    
    try:
        # Получаем все игры пользователя
        user_games_result = supabase.table('user_games').select(
            'game_id, hours_played'
        ).eq('user_id', user_id).execute()
        
        if not user_games_result.data:
            return jsonify({
                'total_games': 0,
                'total_hours': 0,
                'genre_stats': [],
                'predominant_genre': None
            }), 200
        
        total_games = len(user_games_result.data)
        total_hours = sum(item.get('hours_played', 0) or 0 for item in user_games_result.data)
        
        # Получаем ID всех игр
        game_ids = [item['game_id'] for item in user_games_result.data]
        
        if not game_ids:
            return jsonify({
                'total_games': 0,
                'total_hours': 0,
                'genre_stats': [],
                'predominant_genre': None
            }), 200
        
        # Получаем информацию об играх с жанрами
        games_result = supabase.table('games').select('id, genre_id').in_('id', game_ids).execute()
        
        # Получаем жанры
        genres_result = supabase.table('genres').select('id, name').execute()
        genre_map = {g['id']: g['name'] for g in genres_result.data}
        
        # Создаем маппинг игр к жанрам
        game_genre_map = {g['id']: genre_map.get(g.get('genre_id')) for g in games_result.data}
        
        # Подсчет статистики по жанрам
        genre_stats_dict = {}
        for item in user_games_result.data:
            game_id = item['game_id']
            genre_name = game_genre_map.get(game_id) or 'Без жанра'
            hours = item.get('hours_played', 0) or 0
            
            if genre_name not in genre_stats_dict:
                genre_stats_dict[genre_name] = {'count': 0, 'hours': 0}
            
            genre_stats_dict[genre_name]['count'] += 1
            genre_stats_dict[genre_name]['hours'] += hours
        
        # Преобразуем в список и сортируем
        genre_stats = [
            {'genre': genre, 'count': stats['count'], 'hours': stats['hours']}
            for genre, stats in genre_stats_dict.items()
        ]
        genre_stats.sort(key=lambda x: (x['count'], x['hours']), reverse=True)
        
        predominant_genre = genre_stats[0]['genre'] if genre_stats else None
        
        return jsonify({
            'total_games': total_games,
            'total_hours': round(total_hours, 2),
            'genre_stats': genre_stats,
            'predominant_genre': predominant_genre
        }), 200
    except Exception as e:
        return jsonify({'error': f'Ошибка загрузки статистики: {str(e)}'}), 500

@app.route('/api/recommendations', methods=['GET'])
@login_required
def get_recommendations():
    """Получение рекомендаций на основе статистики"""
    user_id = session['user_id']
    supabase = get_supabase()
    
    try:
        # Получаем игры пользователя
        user_games_result = supabase.table('user_games').select('game_id').eq('user_id', user_id).execute()
        
        if not user_games_result.data:
            # Если нет игр, возвращаем популярные игры
            games_result = supabase.table('games').select(
                'id, title, developer, publisher, release_year, description, genre_id'
            ).order('release_year', desc=True).limit(10).execute()
            
            # Получаем жанры
            genres_result = supabase.table('genres').select('id, name').execute()
            genre_map = {g['id']: g['name'] for g in genres_result.data}
            
            recommendations = []
            for game in games_result.data:
                genre_id = game.get('genre_id')
                genre_name = genre_map.get(genre_id) if genre_id else None
                recommendations.append({
                    'id': game['id'],
                    'title': game['title'],
                    'developer': game.get('developer'),
                    'publisher': game.get('publisher'),
                    'release_year': game.get('release_year'),
                    'description': game.get('description'),
                    'genre': genre_name
                })
            
            return jsonify(recommendations), 200
        
        # Получаем ID игр пользователя
        user_game_ids = [item['game_id'] for item in user_games_result.data]
        
        # Получаем информацию об играх пользователя для определения жанров
        games_result = supabase.table('games').select('id, genre_id').in_('id', user_game_ids).execute()
        
        # Подсчитываем жанры
        genre_counts = {}
        for game in games_result.data:
            genre_id = game.get('genre_id')
            if genre_id:
                genre_counts[genre_id] = genre_counts.get(genre_id, 0) + 1
        
        if not genre_counts:
            return jsonify([]), 200
        
        # Находим преобладающий жанр ID
        predominant_genre_id = max(genre_counts, key=genre_counts.get)
        
        # Рекомендуем игры того же жанра, которых нет в коллекции
        recommendations_result = supabase.table('games').select(
            'id, title, developer, publisher, release_year, description, genre_id'
        ).eq('genre_id', predominant_genre_id).order('release_year', desc=True).limit(20).execute()
        
        # Получаем жанры
        genres_result = supabase.table('genres').select('id, name').execute()
        genre_map = {g['id']: g['name'] for g in genres_result.data}
        
        recommendations = []
        for game in recommendations_result.data:
            # Пропускаем игры, которые уже в коллекции
            if game['id'] in user_game_ids:
                continue
            
            genre_id = game.get('genre_id')
            genre_name = genre_map.get(genre_id) if genre_id else None
            recommendations.append({
                'id': game['id'],
                'title': game['title'],
                'developer': game.get('developer'),
                'publisher': game.get('publisher'),
                'release_year': game.get('release_year'),
                'description': game.get('description'),
                'genre': genre_name
            })
            
            if len(recommendations) >= 10:
                break
        
        return jsonify(recommendations), 200
    except Exception as e:
        return jsonify({'error': f'Ошибка загрузки рекомендаций: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
